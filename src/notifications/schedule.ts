import type { StreakInfo } from '../types';
import { reminderCopy, type ReminderKind, type ReminderTone } from './copy';

export const DEFAULT_DAYS_AHEAD = 7;
const FALLBACK_EVENING = '18:00';
const FALLBACK_LATE = '21:00';

export interface ReminderScheduleInput {
  now: Date;
  evening: string; // 'HH:MM', 24h local
  late: string; // 'HH:MM', 24h local
  streak: StreakInfo;
  daysAhead?: number; // number of days scheduled, today included
}

export interface ScheduledReminder {
  date: Date;
  title: string;
  body: string;
}

export function parseTime(value: string, fallback: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }
  const [hour, minute] = fallback.split(':').map(Number);
  return { hour, minute };
}

// Full days without activity before the day `offset` days from now, assuming the user does
// nothing more after this moment. Any session completion triggers a resync, so that assumption
// is the only one the copy can be built on.
function missedDaysBefore(offset: number, streak: StreakInfo): number {
  if (streak.doneToday) return Math.max(0, offset - 1);
  return streak.atRisk ? offset + 1 : offset;
}

export function toneForDay(offset: number, streak: StreakInfo): ReminderTone {
  if (streak.current <= 0) return 'fresh';
  const missed = missedDaysBefore(offset, streak);
  if (missed === 0) return 'calm';
  return missed === 1 ? 'atRisk' : 'fresh';
}

export function buildReminderSchedule(input: ReminderScheduleInput): ScheduledReminder[] {
  const { now, streak } = input;
  const days = Math.max(1, Math.floor(input.daysAhead ?? DEFAULT_DAYS_AHEAD));
  const evening = parseTime(input.evening, FALLBACK_EVENING);
  const late = parseTime(input.late, FALLBACK_LATE);
  const sameTime = evening.hour === late.hour && evening.minute === late.minute;

  const slots: { kind: ReminderKind; hour: number; minute: number }[] = sameTime
    ? [{ kind: 'late', ...late }]
    : [
        { kind: 'evening', ...evening },
        { kind: 'late', ...late },
      ];

  const reminders: ScheduledReminder[] = [];
  for (let offset = 0; offset < days; offset++) {
    if (offset === 0 && streak.doneToday) continue;
    const tone = toneForDay(offset, streak);
    for (const slot of slots) {
      const date = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + offset,
        slot.hour,
        slot.minute,
        0,
        0,
      );
      if (date.getTime() <= now.getTime()) continue;
      reminders.push({ date, ...reminderCopy(slot.kind, tone, streak.current) });
    }
  }
  return reminders.sort((a, b) => a.date.getTime() - b.date.getTime());
}
