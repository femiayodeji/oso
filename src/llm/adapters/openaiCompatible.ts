import { LlmError } from '../errors';
import { postJson } from '../http';
import type { CompletionRequest } from '../jsonCompletion';
import { cachedSystem, withCachedLastMessage } from './anthropic';

export type AdapterConfig = { baseUrl: string; model: string; apiKey: string };

// JSON mode is only safe when the prompt itself mentions JSON (OpenAI rejects it otherwise).
export function canUseJsonMode(req: CompletionRequest): boolean {
  if (!req.json) return false;
  const haystack = [req.system, ...req.messages.map((m) => m.content)].join('\n');
  return /json/i.test(haystack);
}

// OpenAI, DeepSeek, Gemini, Groq and most OpenRouter models cache a repeated prefix on their
// own, so for them the request stays plain and caching just needs a stable prefix. Anthropic
// models behind OpenRouter only cache with explicit cache_control markers on content blocks.
export function needsCacheMarkers(baseUrl: string, model: string): boolean {
  // A regex, not URL.hostname: React Native's URL polyfill does not implement it everywhere.
  const host = (/^https?:\/\/([^/:?#]+)/i.exec(baseUrl.trim())?.[1] ?? '').toLowerCase();
  const isOpenRouter = host === 'openrouter.ai' || host.endsWith('.openrouter.ai');
  return isOpenRouter && /^anthropic\//i.test(model.trim());
}

export function buildOpenAiBody(
  model: string,
  req: CompletionRequest,
  jsonMode: boolean,
  cacheMarkers = false,
): Record<string, unknown> {
  const mark = cacheMarkers ? req.cache : undefined;
  const history = req.messages.map((m) => ({ role: m.role, content: m.content }));
  const messages = [
    ...(req.system ? [{ role: 'system', content: mark ? cachedSystem(req.system) : req.system }] : []),
    ...(mark === 'conversation' ? withCachedLastMessage(history) : history),
  ];
  return {
    model,
    messages,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };
}

export function parseOpenAiResponse(data: unknown): string {
  const choices = (data as { choices?: unknown } | null)?.choices;
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  const content = (first as { message?: { content?: unknown } } | undefined)?.message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part: unknown) => (part as { text?: unknown } | null)?.text)
      .filter((t): t is string => typeof t === 'string')
      .join('');
    if (text.trim()) return text;
  }
  throw new LlmError('bad_response');
}

export async function completeOpenAiCompatible(config: AdapterConfig, req: CompletionRequest): Promise<string> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const cacheMarkers = needsCacheMarkers(config.baseUrl, config.model);
  const send = (jsonMode: boolean) =>
    postJson(url, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      body: buildOpenAiBody(config.model, req, jsonMode, cacheMarkers),
      secrets: [config.apiKey],
    });

  const jsonMode = canUseJsonMode(req);
  try {
    return parseOpenAiResponse(await send(jsonMode));
  } catch (e) {
    // Some models behind OpenAI-compatible endpoints reject response_format.
    const rejectedJsonMode = jsonMode && e instanceof LlmError && e.status === 400;
    if (!rejectedJsonMode) throw e;
    return parseOpenAiResponse(await send(false));
  }
}
