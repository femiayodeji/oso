// Live provider checks. Skipped unless OSO_LIVE=1; keys come from .env (never printed).
//   OSO_LIVE=1 npx jest src/llm/__tests__/live.test.ts
import { readFileSync } from 'fs';
import { join } from 'path';

import type { AppSettings, Topic, Unit } from '../../types';
import { parseChatReply } from '../chatReply';
import { complete, testConnection } from '../client';
import { buildOutline, generateUnitContent } from '../generate';
import { chatSystemPrompt } from '../prompts';

const mockState: { key: string | null; settings: AppSettings } = {
  key: null,
  settings: {
    provider: 'openrouter',
    baseUrl: '',
    model: '',
    reminderEvening: '18:00',
    reminderLate: '21:00',
    colorScheme: 'system',
    soundsEnabled: true,
    bestStreak: 0,
  },
};

jest.mock('../apiKey', () => ({ getApiKey: async () => mockState.key }));
jest.mock('../../db/settings', () => ({ getSettings: async () => mockState.settings }));

// jest-expo replaces global fetch with a stubbed native one, so route requests through node's https.
type FetchInit = { method: string; headers: Record<string, string>; body: string };
function nodeFetch(url: string, init: FetchInit) {
  const { request } = jest.requireActual<typeof import('https')>('https');
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method, headers: init.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        const header = (name: string) => res.headers[name.toLowerCase()];
        resolve({
          status,
          ok: status >= 200 && status < 300,
          text: async () => Buffer.concat(chunks).toString('utf8'),
          headers: { get: (name: string) => (typeof header(name) === 'string' ? header(name) : null) },
        });
      });
    });
    req.on('error', reject);
    req.end(init.body);
  });
}
Object.defineProperty(globalThis, 'fetch', { value: nodeFetch, writable: true, configurable: true });

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    for (const line of readFileSync(join(__dirname, '../../../.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // no .env: every target is skipped
  }
  return env;
}

const env = loadEnv();

// Models the test keys can reach; override with OSO_*_MODEL.
const targets = [
  {
    name: 'OpenRouter',
    key: env.OPENROUTER_API_KEY,
    baseUrl: '',
    model: process.env.OSO_OPENROUTER_MODEL ?? 'google/gemma-4-31b-it:free',
  },
  {
    name: 'Groq (OpenAI-compatible)',
    key: env.GROQ_API_KEY,
    baseUrl: 'https://api.groq.com/openai/v1',
    model: process.env.OSO_GROQ_MODEL ?? 'openai/gpt-oss-120b',
  },
  {
    name: 'Gemini (OpenAI-compatible)',
    key: env.GEMINI_API_KEY,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: process.env.OSO_GEMINI_MODEL ?? 'gemini-3.8-flash',
  },
];

const topic: Topic = {
  id: 1,
  title: 'Atomic Habits',
  author: 'James Clear',
  source: 'model_knowledge',
  fileUri: null,
  status: 'generating',
  planDays: null,
  icon: null,
  depth: 'quick',
  createdAt: '2026-01-01T00:00:00',
};

const live = process.env.OSO_LIVE === '1' ? describe : describe.skip;

live.each(targets)('live: $name', (target) => {
  const run = target.key ? it : it.skip;
  let units: Unit[] = [];

  beforeAll(() => {
    mockState.key = target.key ?? null;
    mockState.settings = { ...mockState.settings, baseUrl: target.baseUrl, model: target.model };
  });

  run('testConnection succeeds', async () => {
    await expect(testConnection()).resolves.toBeUndefined();
  }, 120_000);

  run('outline from model knowledge', async () => {
    const { units: outline } = await buildOutline(topic);
    expect(outline.length).toBeGreaterThan(3);
    units = outline.map((c) => ({
      id: c.idx + 1,
      topicId: topic.id,
      idx: c.idx,
      title: c.title,
      sourceText: null,
      summary: null,
      genStatus: 'pending',
    }));
    console.log(`${target.name}: ${outline.length} units, first: ${outline[0].title}`);
  }, 240_000);

  run('unit summary and cards validate', async () => {
    expect(units.length).toBeGreaterThan(0);
    const { summary, cards } = await generateUnitContent(topic, units[0], units);
    expect(summary.length).toBeGreaterThan(40);
    expect(cards.length).toBeGreaterThan(2);
    for (const card of cards.filter((c) => c.type === 'recall')) expect(card.back).toBeTruthy();
    console.log(`${target.name}: ${cards.length} cards (${cards.map((c) => c.type).join(', ')})`);
  }, 240_000);

  run('chat emits a set_plan action when asked', async () => {
    const system = chatSystemPrompt({
      topic,
      units: units.slice(0, 3),
      cardsReady: true,
      cardCount: 80,
      sessionsTotal: 0,
      sessionsCompleted: 0,
    });
    const raw = await complete({ system, messages: [{ role: 'user', content: 'I want to finish this in 5 days.' }] });
    const parsed = parseChatReply(raw);
    expect(parsed.action).toEqual({ action: 'set_plan', days: 5 });
    expect(parsed.text).not.toContain('set_plan');
  }, 120_000);
});
