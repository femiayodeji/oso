import { toNewCards } from '../generate';
import { cardCountRange, outlinePrompt } from '../prompts';
import { cardSchema, outlineSchema, rewrittenQuizSchema } from '../schemas';

const quiz = { type: 'quiz', front: 'Which?', options: ['A', 'B', 'C'], answer: 1, back: 'Because B.' };

describe('quiz card validation', () => {
  it('accepts a well-formed quiz', () => {
    expect(cardSchema.safeParse(quiz).success).toBe(true);
  });

  it('rejects a quiz without options, or with the answer out of range', () => {
    expect(cardSchema.safeParse({ ...quiz, options: undefined }).success).toBe(false);
    expect(cardSchema.safeParse({ ...quiz, answer: 3 }).success).toBe(false);
    expect(cardSchema.safeParse({ ...quiz, answer: undefined }).success).toBe(false);
    expect(cardSchema.safeParse({ ...quiz, options: ['only one'] }).success).toBe(false);
  });

  it('holds a rewritten quiz to the same rule', () => {
    expect(rewrittenQuizSchema.safeParse({ front: 'Q', options: ['A', 'B'], answer: 0 }).success).toBe(true);
    expect(rewrittenQuizSchema.safeParse({ front: 'Q' }).success).toBe(false);
  });
});

describe('toNewCards', () => {
  it('keeps quiz options, answer and explanation, and drops them from other types', () => {
    const cards = toNewCards([
      { type: 'key_idea', front: 'Idea', back: 'stray', options: ['x', 'y'], answer: 0 },
      { type: 'summary', front: 'Hook' },
      { type: 'quiz', front: 'Which?', options: ['A', 'B', 'C'], answer: 1, back: 'Because B.' },
    ]);
    expect(cards.map((c) => c.type)).toEqual(['summary', 'key_idea', 'quiz']);
    expect(cards[1]).toMatchObject({ back: null, options: null, answerIdx: null });
    expect(cards[2]).toMatchObject({ back: 'Because B.', options: ['A', 'B', 'C'], answerIdx: 1 });
  });
});

describe('outline', () => {
  it('reads the topic fields and tolerates their absence', () => {
    const full = outlineSchema.parse({ known: true, kind: 'book', title: 'T', author: 'A', icon: 'book', units: [{ title: 'U' }] });
    expect(full.kind).toBe('book');
    expect(outlineSchema.safeParse({ units: [{ title: 'U' }] }).success).toBe(true);
  });

  it('asks for the depth unit range and lists the icons', () => {
    const content = outlinePrompt({ title: 'Stoicism', author: null, depth: 'quick' }).messages[0].content;
    expect(content).toContain('Design 4 to 6 units');
    expect(content).toContain('flask');
  });

  it('sizes cards by depth without a source and by length with one', () => {
    expect(cardCountRange(null, 'quick')).toEqual({ min: 4, max: 6 });
    expect(cardCountRange(null, 'deep')).toEqual({ min: 8, max: 12 });
    expect(cardCountRange(3_000, 'deep')).toEqual({ min: 4, max: 7 });
  });
});
