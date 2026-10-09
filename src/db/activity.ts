import { todayLocal } from '../lib/dates';
import { computeBestStreak, computeStreak } from '../streak/computeStreak';
import type { StreakInfo } from '../types';
import { getDb } from './index';
import { getSettings, updateSettings } from './settings';

export async function listActiveDates(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: string }>(
    'SELECT date FROM daily_activity WHERE tasks_completed > 0 ORDER BY date',
    [],
  );
  return rows.map((r) => r.date);
}

// The streak is always derived from daily_activity; only the all-time best is stored.
export async function getStreak(today: string = todayLocal()): Promise<StreakInfo> {
  const dates = await listActiveDates();
  const best = computeBestStreak(dates);
  const settings = await getSettings();
  if (best > settings.bestStreak) await updateSettings({ bestStreak: best });
  return computeStreak(dates, today);
}
