import { describe, expect, it } from '@jest/globals';

import {
  cardBudget,
  cardsPerDay,
  cardsPerUnit,
  fitDays,
  isOverloaded,
  MAX_CARDS_PER_UNIT,
  MIN_CARDS_PER_UNIT,
  minDaysFor,
  suggestedDays,
  unitCountFor,
} from '../budget';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('cardBudget and unitCountFor', () => {
  it('gives about ten cards a day', () => {
    expect(cardBudget(7)).toBe(70);
    expect(cardBudget(0)).toBe(10);
  });

  it('asks for about eight cards per unit, within bounds', () => {
    expect(unitCountFor(3)).toBe(4);
    expect(unitCountFor(7)).toBe(9);
    expect(unitCountFor(14)).toBe(18);
    expect(unitCountFor(1)).toBe(3);
    expect(unitCountFor(365)).toBe(40);
  });
});

describe('cardsPerUnit', () => {
  it('splits evenly without source text, close to the budget', () => {
    const counts = cardsPerUnit(7, Array(unitCountFor(7)).fill(null));
    expect(new Set(counts).size).toBe(1);
    expect(Math.abs(sum(counts) - 70)).toBeLessThanOrEqual(5);
  });

  it('never goes below the minimum or above the maximum', () => {
    expect(cardsPerUnit(3, Array(20).fill(null))).toEqual(Array(20).fill(MIN_CARDS_PER_UNIT));
    expect(cardsPerUnit(30, [null, null])).toEqual([MAX_CARDS_PER_UNIT, MAX_CARDS_PER_UNIT]);
  });

  it('gives long chapters more cards', () => {
    const [short, long] = cardsPerUnit(3, [5_000, 15_000]);
    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThanOrEqual(MIN_CARDS_PER_UNIT);
  });

  it('handles no units', () => {
    expect(cardsPerUnit(7, [])).toEqual([]);
  });
});

describe('fitDays', () => {
  it('keeps the plan when the chapters fit', () => {
    expect(fitDays(7, 20)).toBe(7);
    expect(fitDays(3, 12)).toBe(3);
  });

  it('stretches the plan when even the minimum per chapter is too much', () => {
    expect(minDaysFor(30)).toBe(8);
    expect(fitDays(3, 30)).toBe(8);
    expect(fitDays(3, 13)).toBe(4);
  });
});

describe('pace', () => {
  it('reports cards a day and the days that keep it near ten', () => {
    expect(cardsPerDay(57, 3)).toBe(19);
    expect(suggestedDays(57)).toBe(6);
    expect(suggestedDays(0)).toBe(1);
  });

  it('flags more than twelve a day', () => {
    expect(isOverloaded(36, 3)).toBe(false);
    expect(isOverloaded(37, 3)).toBe(true);
  });
});
