import { describe, expect, it } from '@jest/globals';

import { cardsPerUnit, fitDays, MAX_CARDS_PER_SESSION, unitCountFor } from '../budget';
import { planRemaining, planWithinTotal, splitIntoSessions, type PlanCard } from '../splitPlan';

// `perUnit[i]` cards in unit i, ids counting up from 1 in reading order.
function makeCards(perUnit: number[]): PlanCard[] {
  const cards: PlanCard[] = [];
  let id = 1;
  perUnit.forEach((count, unitIdx) => {
    for (let i = 0; i < count; i++) {
      cards.push({ id: id++, unitIdx, unitTitle: `Unit ${unitIdx + 1}` });
    }
  });
  return cards;
}

const sizes = (sessions: { cardIds: number[] }[]) => sessions.map((t) => t.cardIds.length);
const flat = (sessions: { cardIds: number[] }[]) => sessions.flatMap((t) => t.cardIds);

describe('splitIntoSessions', () => {
  it('returns nothing for no cards', () => {
    expect(splitIntoSessions([], 5)).toEqual([]);
  });

  it('splits evenly when the cards divide by the days', () => {
    expect(sizes(splitIntoSessions(makeCards([6, 6]), 4))).toEqual([3, 3, 3, 3]);
  });

  it('balances sizes to within one card, larger sessions first', () => {
    expect(sizes(splitIntoSessions(makeCards([10]), 3))).toEqual([4, 3, 3]);
    expect(sizes(splitIntoSessions(makeCards([11]), 3))).toEqual([4, 4, 3]);
  });

  it('keeps reading order and uses every card exactly once', () => {
    const cards = makeCards([4, 7, 2]);
    const sessions = splitIntoSessions(cards, 5);
    expect(flat(sessions)).toEqual(cards.map((c) => c.id));
  });

  it('does not reorder cards that arrive out of id order', () => {
    const cards: PlanCard[] = [
      { id: 9, unitIdx: 0, unitTitle: 'A' },
      { id: 2, unitIdx: 0, unitTitle: 'A' },
      { id: 5, unitIdx: 1, unitTitle: 'B' },
    ];
    expect(flat(splitIntoSessions(cards, 2))).toEqual([9, 2, 5]);
  });

  it('never makes more sessions than cards', () => {
    const sessions = splitIntoSessions(makeCards([3]), 10);
    expect(sizes(sessions)).toEqual([1, 1, 1]);
  });

  it('treats days below 1, fractions and non-numbers as sensible whole days', () => {
    const cards = makeCards([6]);
    expect(splitIntoSessions(cards, 0)).toHaveLength(1);
    expect(splitIntoSessions(cards, -3)).toHaveLength(1);
    expect(splitIntoSessions(cards, Number.NaN)).toHaveLength(1);
    expect(splitIntoSessions(cards, 2.9)).toHaveLength(2);
  });

  it('puts everything in one session for a one-day plan', () => {
    const sessions = splitIntoSessions(makeCards([2, 2]), 1);
    expect(sizes(sessions)).toEqual([4]);
    expect(sessions[0].title).toBe('Unit 1 to Unit 2');
  });

  it('titles a session after its unit when it covers one', () => {
    const sessions = splitIntoSessions(makeCards([4, 4]), 4);
    expect(sessions.map((t) => t.title)).toEqual(['Unit 1', 'Unit 1', 'Unit 2', 'Unit 2']);
  });

  it('titles a session with the first and last unit when it spans several', () => {
    const sessions = splitIntoSessions(makeCards([2, 2, 2, 2]), 2);
    expect(sessions.map((t) => t.title)).toEqual([
      'Unit 1 to Unit 2',
      'Unit 3 to Unit 4',
    ]);
    expect(splitIntoSessions(makeCards([1, 1, 1]), 1)[0].title).toBe('Unit 1 to Unit 3');
  });

  it('gives every session a non-empty title and at least one card', () => {
    for (const days of [1, 2, 3, 7, 30]) {
      for (const session of splitIntoSessions(makeCards([5, 1, 9, 3]), days)) {
        expect(session.title.length).toBeGreaterThan(0);
        expect(session.cardIds.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('planRemaining', () => {
  it('spreads the remaining cards over the days asked for, however many sessions are done', () => {
    const plan = planRemaining(makeCards([6, 6]), 5, 3);
    expect(sizes(plan.sessions)).toEqual([4, 4, 4]);
    expect(plan.planDays).toBe(8);
  });

  it('is a plain split when nothing is completed yet', () => {
    const cards = makeCards([5, 5]);
    const plan = planRemaining(cards, 0, 5);
    expect(plan.planDays).toBe(5);
    expect(plan.sessions).toEqual(splitIntoSessions(cards, 5));
  });

  it('keeps every remaining card exactly once, in order', () => {
    const cards = makeCards([4, 7, 2]);
    expect(flat(planRemaining(cards, 2, 4).sessions)).toEqual(cards.map((c) => c.id));
  });

  it('counts the days asked for even when there are fewer cards than days', () => {
    const plan = planRemaining(makeCards([2]), 3, 5);
    expect(sizes(plan.sessions)).toEqual([1, 1]);
    expect(plan.planDays).toBe(8);
  });

  it('treats bad day counts as one day', () => {
    for (const days of [0, -2, Number.NaN]) {
      const plan = planRemaining(makeCards([6]), 2, days);
      expect(plan.sessions).toHaveLength(1);
      expect(plan.planDays).toBe(3);
    }
    expect(planRemaining(makeCards([6]), 2, 2.9).planDays).toBe(4);
  });

  it('makes no sessions when no cards are left', () => {
    expect(planRemaining([], 4, 3)).toEqual({ planDays: 7, sessions: [] });
  });
});

describe('planWithinTotal', () => {
  it('fits the remaining cards into what is left of a fixed total', () => {
    const plan = planWithinTotal(makeCards([6, 6]), 2, 5);
    expect(plan.planDays).toBe(5);
    expect(sizes(plan.sessions)).toEqual([4, 4, 4]);
  });

  it('equals the total when nothing is completed', () => {
    const plan = planWithinTotal(makeCards([10]), 0, 4);
    expect(plan.planDays).toBe(4);
    expect(plan.sessions).toHaveLength(4);
  });

  it('adds one more day when the total is already used up', () => {
    const plan = planWithinTotal(makeCards([4]), 5, 5);
    expect(sizes(plan.sessions)).toEqual([4]);
    expect(plan.planDays).toBe(6);
  });
});

describe('splitIntoSessions with the card budget', () => {
  it('keeps every session of a new plan at or under the daily maximum', () => {
    for (const days of [3, 7, 14, 30]) {
      const perUnit = cardsPerUnit(days, Array(unitCountFor(days)).fill(null));
      const sessions = splitIntoSessions(makeCards(perUnit), days);
      expect(sessions).toHaveLength(days);
      expect(Math.max(...sizes(sessions))).toBeLessThanOrEqual(MAX_CARDS_PER_SESSION);
    }
  });

  it('keeps a stretched book plan at or under the daily maximum', () => {
    const days = fitDays(3, 30);
    const sessions = splitIntoSessions(makeCards(cardsPerUnit(days, Array(30).fill(null))), days);
    expect(Math.max(...sizes(sessions))).toBeLessThanOrEqual(MAX_CARDS_PER_SESSION);
  });
});
