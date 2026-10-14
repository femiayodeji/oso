import type { StreakInfo } from '../../types';
import { buildReminderSchedule, parseTime, toneForDay } from '../schedule';

const safe: StreakInfo = { current: 4, doneToday: false, atRisk: false };
const done: StreakInfo = { current: 5, doneToday: true, atRisk: false };
const atRisk: StreakInfo = { current: 4, doneToday: false, atRisk: true };
const none: StreakInfo = { current: 0, doneToday: false, atRisk: false };

// Local time, 10 March 2026.
const at = (hour: number, minute = 0) => new Date(2026, 2, 10, hour, minute);

const build = (now: Date, streak: StreakInfo, daysAhead?: number) =>
  buildReminderSchedule({ now, evening: '18:00', late: '21:00', streak, daysAhead });

const stamp = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;

describe('parseTime', () => {
  it('parses HH:MM', () => {
    expect(parseTime('18:30', '18:00')).toEqual({ hour: 18, minute: 30 });
    expect(parseTime('7:05', '18:00')).toEqual({ hour: 7, minute: 5 });
  });

  it('falls back on invalid input', () => {
    expect(parseTime('', '18:00')).toEqual({ hour: 18, minute: 0 });
    expect(parseTime('25:00', '21:00')).toEqual({ hour: 21, minute: 0 });
    expect(parseTime('12:75', '21:00')).toEqual({ hour: 21, minute: 0 });
    expect(parseTime('evening', '21:00')).toEqual({ hour: 21, minute: 0 });
  });
});

describe('buildReminderSchedule', () => {
  it('schedules evening and late reminders for 7 days by default', () => {
    const result = build(at(9), safe);
    expect(result).toHaveLength(14);
    expect(stamp(result[0].date)).toBe('3/10 18:0');
    expect(stamp(result[1].date)).toBe('3/10 21:0');
    expect(stamp(result[13].date)).toBe('3/16 21:0');
  });

  it('returns reminders in chronological order, all in the future', () => {
    const now = at(9);
    const result = build(now, safe);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].date.getTime()).toBeGreaterThan(now.getTime());
      if (i > 0) expect(result[i].date.getTime()).toBeGreaterThan(result[i - 1].date.getTime());
    }
  });

  it("skips today's reminders when today is already done", () => {
    const result = build(at(9), done);
    expect(result).toHaveLength(12);
    expect(stamp(result[0].date)).toBe('3/11 18:0');
  });

  it('skips times that have already passed today', () => {
    const afterEvening = build(at(19), safe);
    expect(afterEvening).toHaveLength(13);
    expect(stamp(afterEvening[0].date)).toBe('3/10 21:0');

    const afterBoth = build(at(22), safe);
    expect(afterBoth).toHaveLength(12);
    expect(stamp(afterBoth[0].date)).toBe('3/11 18:0');
  });

  it('skips a reminder scheduled for exactly now', () => {
    expect(stamp(build(at(18), safe)[0].date)).toBe('3/10 21:0');
  });

  it('respects daysAhead and configured times', () => {
    const result = buildReminderSchedule({
      now: at(9),
      evening: '17:15',
      late: '22:45',
      streak: safe,
      daysAhead: 5,
    });
    expect(result).toHaveLength(10);
    expect(stamp(result[0].date)).toBe('3/10 17:15');
    expect(stamp(result[9].date)).toBe('3/14 22:45');
  });

  it('schedules a single reminder per day when both times are equal', () => {
    const result = buildReminderSchedule({
      now: at(9),
      evening: '20:00',
      late: '20:00',
      streak: safe,
      daysAhead: 3,
    });
    expect(result).toHaveLength(3);
  });

  it('crosses month boundaries using local dates', () => {
    const result = build(new Date(2026, 0, 30, 23, 30), safe, 3);
    expect(result.map((r) => stamp(r.date))).toEqual([
      '1/31 18:0',
      '1/31 21:0',
      '2/1 18:0',
      '2/1 21:0',
    ]);
  });

  it('uses calm copy today when the streak is safe', () => {
    const [evening, late] = build(at(9), safe);
    expect(evening.title).toBe('Time to learn');
    expect(evening.body).toContain('4-day streak');
    expect(late.title).not.toContain('dies');
  });

  it('uses dramatic copy today when yesterday had no activity', () => {
    const [evening, late] = build(at(9), atRisk);
    expect(evening.title).toBe('Your streak dies tonight');
    expect(late.title).toContain('dies tonight');
  });

  it('never uses dramatic copy without a streak', () => {
    for (const reminder of build(at(9), none)) {
      expect(reminder.title).not.toContain('dies');
    }
  });
});

describe('toneForDay', () => {
  it('projects forward from a safe, not-yet-done day', () => {
    expect([0, 1, 2, 3].map((d) => toneForDay(d, safe))).toEqual([
      'calm',
      'atRisk',
      'fresh',
      'fresh',
    ]);
  });

  it('projects forward from a completed day', () => {
    expect([1, 2, 3].map((d) => toneForDay(d, done))).toEqual(['calm', 'atRisk', 'fresh']);
  });

  it('projects forward from an at-risk day', () => {
    expect([0, 1, 2].map((d) => toneForDay(d, atRisk))).toEqual(['atRisk', 'fresh', 'fresh']);
  });

  it('is always fresh without a streak', () => {
    expect([0, 1, 5].map((d) => toneForDay(d, none))).toEqual(['fresh', 'fresh', 'fresh']);
  });
});
