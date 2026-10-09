import { describe, expect, it } from '@jest/globals';

import { addDays } from '../../lib/dates';
import { computeBestStreak, computeStreak } from '../computeStreak';

const TODAY = '2026-03-10';

function daysAgo(...offsets: number[]): string[] {
  return offsets.map((n) => addDays(TODAY, -n));
}

describe('computeStreak', () => {
  it('is zero for empty input', () => {
    expect(computeStreak([], TODAY)).toEqual({ current: 0, doneToday: false, atRisk: false });
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak(daysAgo(0, 1, 2), TODAY)).toEqual({
      current: 3,
      doneToday: true,
      atRisk: false,
    });
  });

  it('counts a single active day', () => {
    expect(computeStreak([TODAY], TODAY)).toEqual({ current: 1, doneToday: true, atRisk: false });
  });

  describe('today not done yet', () => {
    it('keeps the streak when yesterday was active (today is not a missed day)', () => {
      expect(computeStreak(daysAgo(1, 2, 3), TODAY)).toEqual({
        current: 3,
        doneToday: false,
        atRisk: false,
      });
    });

    it('keeps the streak but flags atRisk when yesterday was the grace day', () => {
      expect(computeStreak(daysAgo(2, 3), TODAY)).toEqual({
        current: 2,
        doneToday: false,
        atRisk: true,
      });
    });

    it('resets after two full missed days, and a dead streak is not at risk', () => {
      expect(computeStreak(daysAgo(3, 4, 5), TODAY)).toEqual({
        current: 0,
        doneToday: false,
        atRisk: false,
      });
    });
  });

  describe('grace rule', () => {
    it('a single missed day does not break the chain and does not add to the count', () => {
      expect(computeStreak(daysAgo(0, 2, 3), TODAY).current).toBe(3);
    });

    it('a missed yesterday is forgiven once today is done', () => {
      expect(computeStreak(daysAgo(0, 2), TODAY)).toEqual({
        current: 2,
        doneToday: true,
        atRisk: false,
      });
    });

    it('a gap of exactly two missed days resets', () => {
      expect(computeStreak(daysAgo(0, 3, 4), TODAY).current).toBe(1);
    });

    it('allows the grace day more than once, as long as the misses are not consecutive', () => {
      expect(computeStreak(daysAgo(0, 2, 4, 6), TODAY).current).toBe(4);
      expect(computeStreak(daysAgo(0, 1, 3, 4, 6), TODAY).current).toBe(5);
    });

    it('stops counting at the first two-day gap further back', () => {
      expect(computeStreak(daysAgo(0, 1, 2, 5, 6, 7), TODAY).current).toBe(3);
    });
  });

  describe('input hygiene', () => {
    it('accepts unsorted input', () => {
      expect(computeStreak(daysAgo(2, 0, 3, 1), TODAY).current).toBe(4);
    });

    it('ignores duplicates', () => {
      expect(computeStreak(daysAgo(0, 0, 1, 1, 1), TODAY).current).toBe(2);
    });

    it('ignores dates after today and malformed strings', () => {
      const dates = [...daysAgo(0, 1), addDays(TODAY, 1), addDays(TODAY, 30), '', 'garbage'];
      expect(computeStreak(dates, TODAY)).toEqual({ current: 2, doneToday: true, atRisk: false });
    });

    it('does not mutate its input', () => {
      const dates = daysAgo(2, 0, 1);
      const copy = [...dates];
      computeStreak(dates, TODAY);
      expect(dates).toEqual(copy);
    });
  });

  describe('calendar boundaries', () => {
    it('crosses a month boundary', () => {
      expect(computeStreak(['2026-02-27', '2026-02-28', '2026-03-01'], '2026-03-01').current).toBe(
        3,
      );
    });

    it('treats Feb 28 to Mar 1 as adjacent in a common year and as a grace gap in a leap year', () => {
      expect(computeStreak(['2026-02-28', '2026-03-02'], '2026-03-02').current).toBe(2);
      expect(computeStreak(['2026-02-27', '2026-03-02'], '2026-03-02').current).toBe(1);
      expect(computeStreak(['2028-02-28', '2028-03-01'], '2028-03-01').current).toBe(2);
      expect(computeStreak(['2028-02-27', '2028-03-01'], '2028-03-01').current).toBe(1);
    });

    it('crosses a year boundary, with and without a grace day', () => {
      expect(computeStreak(['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-01').current).toBe(
        3,
      );
      expect(computeStreak(['2025-12-30', '2026-01-01'], '2026-01-01').current).toBe(2);
      expect(computeStreak(['2025-12-29', '2026-01-01'], '2026-01-01').current).toBe(1);
    });

    it('flags atRisk across a year boundary', () => {
      expect(computeStreak(['2025-12-30', '2025-12-31'], '2026-01-02')).toEqual({
        current: 2,
        doneToday: false,
        atRisk: true,
      });
    });

    it('is unaffected by the spring DST change (23 hour day)', () => {
      const dates = ['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09'];
      expect(computeStreak(dates, '2026-03-09').current).toBe(4);
      expect(computeStreak(['2026-03-07', '2026-03-09'], '2026-03-09').current).toBe(2);
      expect(computeStreak(['2026-03-06', '2026-03-09'], '2026-03-09').current).toBe(1);
    });

    it('is unaffected by the autumn DST change (25 hour day)', () => {
      const dates = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'];
      expect(computeStreak(dates, '2026-11-02').current).toBe(4);
      expect(computeStreak(['2026-10-31', '2026-11-02'], '2026-11-02').current).toBe(2);
      expect(computeStreak(['2026-10-30', '2026-11-02'], '2026-11-02').current).toBe(1);
      expect(computeStreak(['2026-10-31'], '2026-11-02').atRisk).toBe(true);
      expect(computeStreak(['2026-10-31'], '2026-11-03').current).toBe(0);
    });
  });
});

describe('computeBestStreak', () => {
  it('is zero for empty input', () => {
    expect(computeBestStreak([])).toBe(0);
  });

  it('finds the longest chain, not the latest one', () => {
    const dates = [...daysAgo(0, 1), ...daysAgo(10, 11, 12, 13)];
    expect(computeBestStreak(dates)).toBe(4);
    expect(computeStreak(dates, TODAY).current).toBe(2);
  });

  it('applies the same grace rule', () => {
    expect(computeBestStreak(daysAgo(0, 2, 3, 5))).toBe(4);
    expect(computeBestStreak(daysAgo(0, 3, 6))).toBe(1);
  });

  it('handles unsorted and duplicate input', () => {
    expect(computeBestStreak(daysAgo(3, 1, 2, 2, 1))).toBe(3);
  });

  it('is never below the current streak', () => {
    const dates = daysAgo(0, 1, 3, 4, 6, 20, 21);
    expect(computeBestStreak(dates)).toBeGreaterThanOrEqual(computeStreak(dates, TODAY).current);
  });
});
