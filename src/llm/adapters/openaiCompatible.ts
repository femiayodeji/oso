import { LlmError } from '../errors';
import { postJson } from '../http';
import type { CompletionRequest } from '../jsonCompletion';

export type AdapterConfig = { baseUrl: string; model: string; apiKey: string };

// JSON mode is only safe when the prompt itself mentions JSON (OpenAI rejects it otherwise).
export function canUseJsonMode(req: CompletionRequest): boolean {
  if (!req.json) return false;
  const haystack = [req.system, ...req.messages.map((m) => m.content)].join('\n');
  return /json/i.test(haystack);
}

export function buildOpenAiBody(model: string, req: CompletionRequest, jsonMode: boolean): Record<string, unknown> {
  const messages = [
    ...(req.system ? [{ role: 'system', content: req.system }] : []),
    ...req.messages.map((m) => ({ role: m.role, content: m.content })),
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
  const send = (jsonMode: boolean) =>
    postJson(url, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      body: buildOpenAiBody(config.model, req, jsonMode),
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
