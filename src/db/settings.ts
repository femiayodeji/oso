import type { AppSettings, ColorSchemeSetting, Provider } from '../types';
import { getDb, withTransaction } from './index';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openrouter',
  baseUrl: '',
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

// Model and base URL are kept per provider, so switching back restores what was chosen.
const PER_PROVIDER: (keyof AppSettings)[] = ['model', 'baseUrl'];

function storageKey(key: keyof AppSettings, provider: Provider): string {
  return PER_PROVIDER.includes(key) ? `${key}.${provider}` : key;
}

function time(value: string | undefined, fallback: string): string {
  return value !== undefined && TIME_RE.test(value) ? value : fallback;
}

// Stored values are strings; anything missing or unreadable falls back to the default.
function parse(stored: Map<string, string>): AppSettings {
  const d = DEFAULT_SETTINGS;
  const best = Number(stored.get('bestStreak'));
  const sounds = stored.get('soundsEnabled');
  const provider = oneOf(PROVIDERS, stored.get('provider'), d.provider);
  return {
    provider,
    baseUrl: stored.get(storageKey('baseUrl', provider)) ?? d.baseUrl,
    model: stored.get(storageKey('model', provider)) ?? d.model,
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

// The topic last read on Today, so the tab opens on it again. Kept out of AppSettings: it is
// app state, not a preference.
const LAST_TOPIC_KEY = 'lastTopicId';

export async function getLastTopicId(): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [LAST_TOPIC_KEY]);
  const id = Number(row?.value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function setLastTopicId(topicId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [LAST_TOPIC_KEY, String(topicId)],
  );
}

// A model or base URL in the patch belongs to the patch's provider, else the stored one.
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const provider = patch.provider ?? (await getSettings()).provider;
  const entries = (Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[])
    .filter((key) => patch[key] !== undefined)
    .map((key) => [storageKey(key, provider), String(patch[key])] as const);

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
