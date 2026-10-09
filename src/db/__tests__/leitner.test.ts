import { describe, expect, it } from '@jest/globals';

import { BOX_INTERVAL_DAYS, MAX_BOX, initialReview, nextReview } from '../leitner';

const TODAY = '2026-03-10';

describe('leitner', () => {
  it('has a growing interval for every box 1..5', () => {
    expect(MAX_BOX).toBe(5);
    for (let box = 1; box <= MAX_BOX; box++) {
      expect(BOX_INTERVAL_DAYS[box]).toBeGreaterThan(BOX_INTERVAL_DAYS[box - 1] ?? 0);
    }
  });

  it('starts a card in box 1, due tomorrow', () => {
    expect(initialReview(TODAY)).toEqual({ box: 1, dueDate: '2026-03-11' });
  });

  it('moves up one box when remembered and schedules by the new box', () => {
    expect(nextReview(1, true, TODAY)).toEqual({ box: 2, dueDate: '2026-03-13' });
    expect(nextReview(2, true, TODAY)).toEqual({ box: 3, dueDate: '2026-03-17' });
    expect(nextReview(3, true, TODAY)).toEqual({ box: 4, dueDate: '2026-03-24' });
    expect(nextReview(4, true, TODAY)).toEqual({ box: 5, dueDate: '2026-04-09' });
  });

  it('stays in the top box when remembered again', () => {
    expect(nextReview(5, true, TODAY)).toEqual({ box: 5, dueDate: '2026-04-09' });
  });

  it('drops to box 1 when forgotten, from any box', () => {
    for (let box = 1; box <= MAX_BOX; box++) {
      expect(nextReview(box, false, TODAY)).toEqual({ box: 1, dueDate: '2026-03-11' });
    }
  });

  it('treats box 0 and out-of-range boxes as the nearest valid box', () => {
    expect(nextReview(0, true, TODAY).box).toBe(2);
    expect(nextReview(-4, true, TODAY).box).toBe(2);
    expect(nextReview(99, true, TODAY).box).toBe(5);
    expect(nextReview(Number.NaN, false, TODAY).box).toBe(1);
  });

  it('schedules across month and year boundaries', () => {
    expect(nextReview(4, true, '2025-12-20').dueDate).toBe('2026-01-19');
    expect(nextReview(1, false, '2028-02-28').dueDate).toBe('2028-02-29');
  });
});
