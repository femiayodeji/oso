import { LlmError } from '../errors';
import { postJson } from '../http';
import type { CompletionRequest } from '../jsonCompletion';
import type { AdapterConfig } from './openaiCompatible';

export const ANTHROPIC_VERSION = '2023-06-01';
// Thinking on current models counts toward this cap, so leave real headroom.
const MAX_TOKENS = 16_000;

export function buildAnthropicBody(model: string, req: CompletionRequest): Record<string, unknown> {
  return {
    model,
    max_tokens: MAX_TOKENS,
    ...(req.system ? { system: req.system } : {}),
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
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
