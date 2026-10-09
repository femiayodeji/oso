import { z, type ZodType } from 'zod';

import { LlmError } from './errors';
import { parseJsonLoose } from './json';
import { jsonRetryPrompt } from './prompts';

export type LlmMessage = { role: 'user' | 'assistant'; content: string };
export type CompletionRequest = { system: string; messages: LlmMessage[]; json?: boolean };
export type CompleteFn = (req: CompletionRequest) => Promise<string>;

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateJsonReply<T>(raw: string, schema: ZodType<T>): Validation<T> {
  let parsed: unknown;
  try {
    parsed = parseJsonLoose(raw);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON.' };
  }
  const result = schema.safeParse(parsed);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: z.prettifyError(result.error) };
}

// Takes the raw completion function so tests can inject a fake transport.
// Exactly one retry, with the validation error appended, then `bad_response`.
export async function completeJsonWith<T>(
  completeFn: CompleteFn,
  req: CompletionRequest,
  schema: ZodType<T>,
): Promise<T> {
  const first = await completeFn({ ...req, json: true });
  const firstResult = validateJsonReply(first, schema);
  if (firstResult.ok) return firstResult.value;

  const second = await completeFn({
    ...req,
    json: true,
    messages: [
      ...req.messages,
      { role: 'assistant', content: first.trim() || '(empty reply)' },
      { role: 'user', content: jsonRetryPrompt(firstResult.error) },
    ],
  });
  const secondResult = validateJsonReply(second, schema);
  if (secondResult.ok) return secondResult.value;
  throw new LlmError('bad_response');
}
