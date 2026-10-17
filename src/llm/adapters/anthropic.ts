import { LlmError } from '../errors';
import { postJson } from '../http';
import type { CompletionRequest } from '../jsonCompletion';
import type { AdapterConfig } from './openaiCompatible';

export const ANTHROPIC_VERSION = '2023-06-01';
// Thinking on current models counts toward this cap, so leave real headroom.
const MAX_TOKENS = 16_000;

const EPHEMERAL = { type: 'ephemeral' } as const;

type TextBlock = { type: 'text'; text: string; cache_control?: typeof EPHEMERAL };

// Anthropic-style cache breakpoints (also what OpenRouter forwards to Anthropic models).
// Explicit markers, not top-level auto caching: auto would land on the unit-specific user
// message and pay the write premium on bytes no later call reads. We use at most 2 of the 4
// allowed. A marker on a prefix below the model's minimum (512 to 4096 tokens) is silently
// ignored: no error and no write charge, just no cache.
export function cachedSystem(system: string): TextBlock[] {
  return [{ type: 'text', text: system, cache_control: EPHEMERAL }];
}

export function withCachedLastMessage<M extends { content: string }>(
  messages: M[],
): (M | (Omit<M, 'content'> & { content: TextBlock[] }))[] {
  return messages.map((m, i) =>
    i === messages.length - 1 ? { ...m, content: [{ type: 'text', text: m.content, cache_control: EPHEMERAL }] } : m,
  );
}

export function buildAnthropicBody(model: string, req: CompletionRequest): Record<string, unknown> {
  const messages = req.messages.map((m) => ({ role: m.role, content: m.content }));
  const system = req.cache ? cachedSystem(req.system) : req.system;
  return {
    model,
    max_tokens: MAX_TOKENS,
    ...(req.system ? { system } : {}),
    messages: req.cache === 'conversation' ? withCachedLastMessage(messages) : messages,
  };
}

export function parseAnthropicResponse(data: unknown): string {
  const body = data as { content?: unknown; stop_reason?: unknown } | null;
  if (body?.stop_reason === 'refusal') {
    throw new LlmError('bad_response', 'The model declined this request.');
  }
  const blocks: unknown[] = Array.isArray(body?.content) ? body.content : [];
  const text = blocks
    .filter((b): b is { type: 'text'; text: string } => {
      const block = b as { type?: unknown; text?: unknown } | null;
      return block?.type === 'text' && typeof block.text === 'string';
    })
    .map((b) => b.text)
    .join('');
  if (!text.trim()) throw new LlmError('bad_response');
  return text;
}

export async function completeAnthropic(config: AdapterConfig, req: CompletionRequest): Promise<string> {
  const data = await postJson(`${config.baseUrl.replace(/\/+$/, '')}/messages`, {
    headers: { 'x-api-key': config.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    body: buildAnthropicBody(config.model, req),
    secrets: [config.apiKey],
  });
  return parseAnthropicResponse(data);
}
