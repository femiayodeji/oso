import type { AppSettings, ColorSchemeSetting, Provider } from '../types';
import { getDb, withTransaction } from './index';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: '',
  reminderEvening: '18:00',
  reminderLate: '21:00',
  colorScheme: 'system',
  soundsEnabled: true,
  bestStreak: 0,
};

const PROVIDERS: Provider[] = ['openrouter', 'gemini', 'groq', 'anthropic', 'openai'];
const COLOR_SCHEMES: ColorSchemeSetting[] = ['system', 'light', 'dark'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function oneOf<T extends string>(allowed: T[], value: string | undefined, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function time(value: string | undefined, fallback: string): string {
  return value !== undefined && TIME_RE.test(value) ? value : fallback;
}

// Stored values are strings; anything missing or unreadable falls back to the default.
function parse(stored: Map<string, string>): AppSettings {
  const d = DEFAULT_SETTINGS;
  const best = Number(stored.get('bestStreak'));
  const sounds = stored.get('soundsEnabled');
  return {
    provider: oneOf(PROVIDERS, stored.get('provider'), d.provider),
    baseUrl: stored.get('baseUrl') ?? d.baseUrl,
    model: stored.get('model') ?? d.model,
    reminderEvening: time(stored.get('reminderEvening'), d.reminderEvening),
    reminderLate: time(stored.get('reminderLate'), d.reminderLate),
    colorScheme: oneOf(COLOR_SCHEMES, stored.get('colorScheme'), d.colorScheme),
    soundsEnabled: sounds === undefined ? d.soundsEnabled : sounds === 'true',
    bestStreak: Number.isInteger(best) && best > 0 ? best : d.bestStreak,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings',
    [],
  );
  return parse(new Map(rows.map((r) => [r.key, r.value])));
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const entries = (Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[])
    .filter((key) => patch[key] !== undefined)
    .map((key) => [key, String(patch[key])] as const);

  if (entries.length > 0) {
    await withTransaction(async (db) => {
      for (const [key, value] of entries) {
        await db.runAsync(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, value],
        );
      }
    });
  }
  return getSettings();
}
