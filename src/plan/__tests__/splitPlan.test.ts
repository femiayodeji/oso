import { describe, expect, it } from '@jest/globals';

import { planRemaining, planWithinTotal, splitIntoTasks, type PlanCard } from '../splitPlan';

// `perChapter[i]` cards in chapter i, ids counting up from 1 in reading order.
function makeCards(perChapter: number[]): PlanCard[] {
  const cards: PlanCard[] = [];
  let id = 1;
  perChapter.forEach((count, chapterIdx) => {
    for (let i = 0; i < count; i++) {
      cards.push({ id: id++, chapterIdx, chapterTitle: `Chapter ${chapterIdx + 1}` });
    }
  });
  return cards;
}

const sizes = (tasks: { cardIds: number[] }[]) => tasks.map((t) => t.cardIds.length);
const flat = (tasks: { cardIds: number[] }[]) => tasks.flatMap((t) => t.cardIds);

describe('splitIntoTasks', () => {
  it('returns nothing for no cards', () => {
    expect(splitIntoTasks([], 5)).toEqual([]);
  });

  it('splits evenly when the cards divide by the days', () => {
    expect(sizes(splitIntoTasks(makeCards([6, 6]), 4))).toEqual([3, 3, 3, 3]);
  });

  it('balances sizes to within one card, larger tasks first', () => {
    expect(sizes(splitIntoTasks(makeCards([10]), 3))).toEqual([4, 3, 3]);
    expect(sizes(splitIntoTasks(makeCards([11]), 3))).toEqual([4, 4, 3]);
  });

  it('keeps reading order and uses every card exactly once', () => {
    const cards = makeCards([4, 7, 2]);
    const tasks = splitIntoTasks(cards, 5);
    expect(flat(tasks)).toEqual(cards.map((c) => c.id));
  });

  it('does not reorder cards that arrive out of id order', () => {
    const cards: PlanCard[] = [
      { id: 9, chapterIdx: 0, chapterTitle: 'A' },
      { id: 2, chapterIdx: 0, chapterTitle: 'A' },
      { id: 5, chapterIdx: 1, chapterTitle: 'B' },
    ];
    expect(flat(splitIntoTasks(cards, 2))).toEqual([9, 2, 5]);
  });

  it('never makes more tasks than cards', () => {
    const tasks = splitIntoTasks(makeCards([3]), 10);
    expect(sizes(tasks)).toEqual([1, 1, 1]);
  });

  it('treats days below 1, fractions and non-numbers as sensible whole days', () => {
    const cards = makeCards([6]);
    expect(splitIntoTasks(cards, 0)).toHaveLength(1);
    expect(splitIntoTasks(cards, -3)).toHaveLength(1);
    expect(splitIntoTasks(cards, Number.NaN)).toHaveLength(1);
    expect(splitIntoTasks(cards, 2.9)).toHaveLength(2);
  });

  it('puts everything in one task for a one-day plan', () => {
    const tasks = splitIntoTasks(makeCards([2, 2]), 1);
    expect(sizes(tasks)).toEqual([4]);
    expect(tasks[0].title).toBe('Chapter 1 to Chapter 2');
  });

  it('titles a task after its chapter when it covers one', () => {
    const tasks = splitIntoTasks(makeCards([4, 4]), 4);
    expect(tasks.map((t) => t.title)).toEqual(['Chapter 1', 'Chapter 1', 'Chapter 2', 'Chapter 2']);
  });

  it('titles a task with the first and last chapter when it spans several', () => {
    const tasks = splitIntoTasks(makeCards([2, 2, 2, 2]), 2);
    expect(tasks.map((t) => t.title)).toEqual([
      'Chapter 1 to Chapter 2',
      'Chapter 3 to Chapter 4',
    ]);
    expect(splitIntoTasks(makeCards([1, 1, 1]), 1)[0].title).toBe('Chapter 1 to Chapter 3');
  });

  it('gives every task a non-empty title and at least one card', () => {
    for (const days of [1, 2, 3, 7, 30]) {
      for (const task of splitIntoTasks(makeCards([5, 1, 9, 3]), days)) {
        expect(task.title.length).toBeGreaterThan(0);
        expect(task.cardIds.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('planRemaining', () => {
  it('spreads the remaining cards over the days asked for, however many tasks are done', () => {
    const plan = planRemaining(makeCards([6, 6]), 5, 3);
    expect(sizes(plan.tasks)).toEqual([4, 4, 4]);
    expect(plan.planDays).toBe(8);
  });

  it('is a plain split when nothing is completed yet', () => {
    const cards = makeCards([5, 5]);
    const plan = planRemaining(cards, 0, 5);
    expect(plan.planDays).toBe(5);
    expect(plan.tasks).toEqual(splitIntoTasks(cards, 5));
  });

  it('keeps every remaining card exactly once, in order', () => {
    const cards = makeCards([4, 7, 2]);
    expect(flat(planRemaining(cards, 2, 4).tasks)).toEqual(cards.map((c) => c.id));
  });

  it('counts the days asked for even when there are fewer cards than days', () => {
    const plan = planRemaining(makeCards([2]), 3, 5);
    expect(sizes(plan.tasks)).toEqual([1, 1]);
    expect(plan.planDays).toBe(8);
  });

  it('treats bad day counts as one day', () => {
    for (const days of [0, -2, Number.NaN]) {
      const plan = planRemaining(makeCards([6]), 2, days);
      expect(plan.tasks).toHaveLength(1);
      expect(plan.planDays).toBe(3);
    }
    expect(planRemaining(makeCards([6]), 2, 2.9).planDays).toBe(4);
  });

  it('makes no tasks when no cards are left', () => {
    expect(planRemaining([], 4, 3)).toEqual({ planDays: 7, tasks: [] });
  });
});

describe('planWithinTotal', () => {
  it('fits the remaining cards into what is left of a fixed total', () => {
    const plan = planWithinTotal(makeCards([6, 6]), 2, 5);
    expect(plan.planDays).toBe(5);
    expect(sizes(plan.tasks)).toEqual([4, 4, 4]);
  });

  it('equals the total when nothing is completed', () => {
    const plan = planWithinTotal(makeCards([10]), 0, 4);
    expect(plan.planDays).toBe(4);
    expect(plan.tasks).toHaveLength(4);
  });

  it('adds one more day when the total is already used up', () => {
    const plan = planWithinTotal(makeCards([4]), 5, 5);
    expect(sizes(plan.tasks)).toEqual([4]);
    expect(plan.planDays).toBe(6);
  });
});
