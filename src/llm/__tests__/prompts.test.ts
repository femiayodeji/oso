import { chatSystemPrompt, heavyPlanNote, unitPrompt, type ChatContext, type UnitPromptInput } from '../prompts';

const base: ChatContext = {
  topic: { title: 'Deep Work', author: 'Cal Newport', source: 'model_knowledge', planDays: null },
  units: [{ idx: 0, title: 'Deep Work Is Valuable', summary: 'Why focus matters.' }],
  cardsReady: true,
  cardCount: 40,
  cardsLeft: 40,
  sessionsTotal: 0,
  sessionsCompleted: 0,
};

describe('chatSystemPrompt plan wording', () => {
  it('tells the model that days counts from now, not the plan total', () => {
    const prompt = chatSystemPrompt(base);
    expect(prompt).toContain('"days" is the number of days from now');
    expect(prompt).toContain('never the total length of the plan');
  });

  it('reports the plan total, the completed sessions and the days left', () => {
    const prompt = chatSystemPrompt({
      ...base,
      topic: { ...base.topic, planDays: 8 },
      sessionsTotal: 8,
      sessionsCompleted: 5,
    });
    expect(prompt).toContain('Current plan: 8 days in total.');
    expect(prompt).toContain('5 of 8 daily sessions are completed, so 3 days are left.');
  });

  it('says a plan cannot be set while the topic is not ready', () => {
    const prompt = chatSystemPrompt({ ...base, cardsReady: false });
    expect(prompt).toContain('a plan cannot be set yet');
    expect(prompt).toContain('do not emit the action');
  });

  it('asks for a first plan when none is set', () => {
    expect(chatSystemPrompt(base)).toContain('No plan is set yet. 40 cards are ready.');
  });
});

describe('chatSystemPrompt pace', () => {
  it('gives the cards left and the recommended days', () => {
    const prompt = chatSystemPrompt({ ...base, cardsLeft: 57 });
    expect(prompt).toContain('57 cards are left to read. At about 10 a day that is 6 days; keeping to 12 a day needs at least 5 days.');
    expect(prompt).toContain('Warn, do not block');
  });

  it('keeps the plan state last so the prefix is stable between turns', () => {
    const a = chatSystemPrompt(base);
    const b = chatSystemPrompt({ ...base, topic: { ...base.topic, planDays: 5 }, sessionsTotal: 5, sessionsCompleted: 1 });
    const plan = a.lastIndexOf('\nPlan\n');
    expect(plan).toBeGreaterThan(a.indexOf('Unit notes'));
    expect(b.slice(0, plan)).toBe(a.slice(0, plan));
  });
});

describe('heavyPlanNote', () => {
  it('names the load and the better number of days', () => {
    expect(heavyPlanNote(19, 7)).toBe("That's about 19 cards a day; 7 days would keep it near 10.");
  });
});

describe('unitPrompt', () => {
  const input: UnitPromptInput = {
    topic: { title: 'Stoicism', author: null, depth: null },
    unit: { idx: 1, title: 'The dichotomy of control', sourceText: null },
    outline: [
      { idx: 0, title: 'Who the Stoics were' },
      { idx: 1, title: 'The dichotomy of control' },
    ],
    cardCount: 8,
  };

  it('asks for the unit card count, with one either way', () => {
    expect(unitPrompt(input).messages[0].content).toContain('Write 8 cards (7 to 9 is fine) for this unit.');
    expect(unitPrompt({ ...input, cardCount: 3 }).messages[0].content).toContain('Write 3 cards (3 to 4 is fine)');
  });

  it('falls back to the legacy range without a card count', () => {
    expect(unitPrompt({ ...input, cardCount: null }).messages[0].content).toContain('Write 6 to 9 cards');
  });

  it('keeps the system prompt identical across the units of a topic', () => {
    const other = unitPrompt({ ...input, unit: { idx: 0, title: 'Who the Stoics were', sourceText: 'Zeno.' }, cardCount: 5 });
    expect(other.system).toBe(unitPrompt(input).system);
    expect(other.system).toContain('2. The dichotomy of control');
    expect(other.messages[0].content).toContain('<source_text>');
    expect(other.system).not.toContain('Zeno');
  });
});
