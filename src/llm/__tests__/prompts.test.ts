import { chatSystemPrompt, type ChatContext } from '../prompts';

const base: ChatContext = {
  topic: { title: 'Deep Work', author: 'Cal Newport', source: 'model_knowledge', planDays: null },
  units: [{ idx: 0, title: 'Deep Work Is Valuable', summary: 'Why focus matters.' }],
  cardsReady: true,
  cardCount: 40,
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
