import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  addDays,
  diffDays,
  isDateString,
  nowIso,
  toLocalDateString,
  todayLocal,
} from '../dates';

describe('toLocalDateString', () => {
  // In any zone that is not UTC, one of these two instants falls on a different UTC day.
  it('uses the local calendar day, not the UTC one', () => {
    expect(toLocalDateString(new Date(2026, 0, 15, 0, 30))).toBe('2026-01-15');
    expect(toLocalDateString(new Date(2026, 0, 15, 23, 30))).toBe('2026-01-15');
  });

  it('switches day exactly at local midnight', () => {
    expect(toLocalDateString(new Date(2026, 5, 30, 23, 59, 59, 999))).toBe('2026-06-30');
    expect(toLocalDateString(new Date(2026, 6, 1, 0, 0, 0, 0))).toBe('2026-07-01');
  });

  it('zero-pads month and day', () => {
    expect(toLocalDateString(new Date(2026, 2, 4, 12))).toBe('2026-03-04');
  });

  it('handles the year boundary', () => {
    expect(toLocalDateString(new Date(2025, 11, 31, 23, 59))).toBe('2025-12-31');
    expect(toLocalDateString(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});

describe('todayLocal', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the local date of the current instant', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 8, 23, 45));
    expect(todayLocal()).toBe('2026-10-08');
  });
});

describe('addDays', () => {
  it('adds and subtracts within a month', () => {
    expect(addDays('2026-03-10', 1)).toBe('2026-03-11');
    expect(addDays('2026-03-10', -9)).toBe('2026-03-01');
    expect(addDays('2026-03-10', 0)).toBe('2026-03-10');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('knows leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('is not thrown off by DST changes', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-11-02', -1)).toBe('2026-11-01');
  });

  it('rejects malformed input', () => {
    expect(() => addDays('2026-3-1', 1)).toThrow();
    expect(() => addDays('not a date', 1)).toThrow();
  });
});

describe('diffDays', () => {
  it('is b minus a in whole days', () => {
    expect(diffDays('2026-03-10', '2026-03-10')).toBe(0);
    expect(diffDays('2026-03-10', '2026-03-12')).toBe(2);
    expect(diffDays('2026-03-12', '2026-03-10')).toBe(-2);
  });

  it('counts across month, year and leap day', () => {
    expect(diffDays('2026-02-27', '2026-03-01')).toBe(2);
    expect(diffDays('2028-02-27', '2028-03-01')).toBe(3);
    expect(diffDays('2025-12-30', '2026-01-02')).toBe(3);
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('counts whole days across DST changes', () => {
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('is the inverse of addDays', () => {
    expect(diffDays('2026-03-01', addDays('2026-03-01', 400))).toBe(400);
  });
});

describe('isDateString', () => {
  it('accepts real calendar dates only', () => {
    expect(isDateString('2026-02-28')).toBe(true);
    expect(isDateString('2028-02-29')).toBe(true);
    expect(isDateString('2026-02-30')).toBe(false);
    expect(isDateString('2026-13-01')).toBe(false);
    expect(isDateString('2026-1-01')).toBe(false);
    expect(isDateString('2026-01-01T00:00:00Z')).toBe(false);
    expect(isDateString('')).toBe(false);
  });
});

describe('nowIso', () => {
  it('returns a parseable instant', () => {
    const iso = nowIso();
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
