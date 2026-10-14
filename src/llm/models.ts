import { getSettings } from '../db/settings';
import { ANTHROPIC_VERSION } from './adapters/anthropic';
import { getApiKey } from './apiKey';
import { LlmError } from './errors';
import { getJson } from './http';
import { resolveBaseUrl } from './providers';

export interface ModelOption {
  id: string;
  free: boolean;
  // Shown under the id: "Free", or the price when the provider reports one.
  note: string | null;
  // USD per 1M tokens, input + output. Null when the provider does not report prices.
  cost: number | null;
}

// Listed by providers next to their chat models, but useless for text generation.
const NOT_CHAT =
  /tts|whisper|transcribe|embed|image|banana|veo|lyria|audio|live|robotics|computer-use|guard|orpheus|research|aqa/i;

function perMillion(value: unknown): number | null {
  const n = (typeof value === 'string' && value.trim()) || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n * 1_000_000 : null;
}

function usd(n: number): string {
  return `$${Number(n.toFixed(n < 1 ? 3 : 2))}`;
}

function toOption(raw: unknown): ModelOption | null {
  const m = raw as {
    id?: unknown;
    pricing?: { prompt?: unknown; completion?: unknown };
    architecture?: { output_modalities?: unknown };
    output_modalities?: unknown;
  } | null;
  if (typeof m?.id !== 'string' || !m.id) return null;
  // Gemini prefixes ids with "models/"; the chat endpoint takes the bare id.
  const id = m.id.replace(/^models\//, '');
  const outputs = m.architecture?.output_modalities ?? m.output_modalities;
  if (Array.isArray(outputs) && !outputs.includes('text')) return null;
  if (NOT_CHAT.test(id)) return null;

  const input = perMillion(m.pricing?.prompt);
  const output = perMillion(m.pricing?.completion);
  if (input === null || output === null) return { id, free: false, note: null, cost: null };
  const free = input === 0 && output === 0;
  return {
    id,
    free,
    note: free ? 'Free' : `${usd(input)} in, ${usd(output)} out per 1M tokens`,
    cost: input + output,
  };
}

// Reads `{ data: [{ id, ... }] }`, the shape every supported provider returns.
// Cheapest first where prices are known, otherwise alphabetical.
export function parseModelList(data: unknown): ModelOption[] {
  const list = (data as { data?: unknown } | null)?.data;
  if (!Array.isArray(list)) return [];
  const byId = new Map<string, ModelOption>();
  for (const raw of list) {
    const option = toOption(raw);
    if (option && !byId.has(option.id)) byId.set(option.id, option);
  }
  return [...byId.values()].sort(
    (a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || a.id.localeCompare(b.id),
  );
}

export async function listModels(): Promise<ModelOption[]> {
  const settings = await getSettings();
  const apiKey = await getApiKey(settings.provider);
  if (!apiKey) throw new LlmError('no_key');
  const anthropic = settings.provider === 'anthropic';
  const data = await getJson(`${resolveBaseUrl(settings)}/models${anthropic ? '?limit=1000' : ''}`, {
    headers: anthropic
      ? { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }
      : { authorization: `Bearer ${apiKey}` },
    secrets: [apiKey],
    timeoutMs: 30_000,
  });
  return parseModelList(data);
}
