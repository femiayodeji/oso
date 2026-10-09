import type { ZodType } from 'zod';

import { getSettings } from '../db/settings';
import { completeAnthropic } from './adapters/anthropic';
import { completeOpenAiCompatible } from './adapters/openaiCompatible';
import { getApiKey } from './apiKey';
import { LlmError } from './errors';
import { completeJsonWith, type CompletionRequest } from './jsonCompletion';
import { TEST_CONNECTION_PROMPT } from './prompts';
import { resolveBaseUrl, resolveModel } from './providers';

export type { CompletionRequest, LlmMessage } from './jsonCompletion';
export { completeJsonWith } from './jsonCompletion';

// The key and settings are read at call time so a change in Settings applies immediately.
export async function complete(req: CompletionRequest): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new LlmError('no_key');
  const settings = await getSettings();
  const config = { apiKey, model: resolveModel(settings), baseUrl: resolveBaseUrl(settings) };
  return settings.provider === 'anthropic'
    ? completeAnthropic(config, req)
    : completeOpenAiCompatible(config, req);
}

export async function completeJson<T>(req: CompletionRequest, schema: ZodType<T>): Promise<T> {
  return completeJsonWith(complete, req, schema);
}

export async function testConnection(): Promise<void> {
  await complete(TEST_CONNECTION_PROMPT);
}
