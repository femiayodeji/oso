import { buildAnthropicBody, parseAnthropicResponse } from '../adapters/anthropic';
import {
  buildOpenAiBody,
  canUseJsonMode,
  completeOpenAiCompatible,
  needsCacheMarkers,
  parseOpenAiResponse,
} from '../adapters/openaiCompatible';
import type { CompletionRequest } from '../jsonCompletion';
import { PROVIDERS, resolveBaseUrl, resolveModel } from '../providers';
import type { AppSettings } from '../../types';

const req: CompletionRequest = { system: 'Return JSON only.', messages: [{ role: 'user', content: 'hi' }], json: true };

const settings = (patch: Partial<AppSettings>): AppSettings => ({
  provider: 'openrouter', baseUrl: PROVIDERS.openrouter.baseUrl, model: '', reminderEvening: '18:00',
  reminderLate: '21:00', colorScheme: 'system', palette: 'standard', soundsEnabled: true, bestStreak: 0, ...patch,
});

describe('openai-compatible adapter', () => {
  it('puts the system prompt first and asks for JSON mode when safe', () => {
    expect(canUseJsonMode(req)).toBe(true);
    expect(buildOpenAiBody('m', req, true)).toEqual({
      model: 'm',
      messages: [{ role: 'system', content: 'Return JSON only.' }, { role: 'user', content: 'hi' }],
      response_format: { type: 'json_object' },
    });
  });

  it('skips JSON mode when the prompt never mentions JSON or json is off', () => {
    expect(canUseJsonMode({ ...req, system: 'Be brief.' })).toBe(false);
    expect(canUseJsonMode({ ...req, json: false })).toBe(false);
    expect(buildOpenAiBody('m', req, false)).not.toHaveProperty('response_format');
  });

  it('reads the reply text and rejects empty replies', () => {
    expect(parseOpenAiResponse({ choices: [{ message: { content: 'hello' } }] })).toBe('hello');
    expect(parseOpenAiResponse({ choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } }] })).toBe('ab');
    expect(() => parseOpenAiResponse({ choices: [] })).toThrow();
    expect(() => parseOpenAiResponse(null)).toThrow();
  });

  it('retries without response_format when the endpoint rejects it', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => '{"error":{"message":"response_format unsupported"}}', headers: { get: () => null } })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: '{}' } }] }), headers: { get: () => null } });
    (globalThis as { fetch: unknown }).fetch = fetchMock;

    await expect(completeOpenAiCompatible({ baseUrl: 'https://x.test/v1/', model: 'm', apiKey: 'k' }, req)).resolves.toBe('{}');
    expect(fetchMock.mock.calls[0][0]).toBe('https://x.test/v1/chat/completions');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer k');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toHaveProperty('response_format');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty('response_format');
  });
});

describe('anthropic adapter', () => {
  it('sends system as a top-level param with max_tokens', () => {
    const body = buildAnthropicBody('claude-opus-5-5', req);
    expect(body.system).toBe('Return JSON only.');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(typeof body.max_tokens).toBe('number');
  });

  it('joins text blocks and ignores thinking blocks', () => {
    const data = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }] };
    expect(parseAnthropicResponse(data)).toBe('ab');
  });

  it('rejects refusals and empty replies', () => {
    expect(() => parseAnthropicResponse({ stop_reason: 'refusal', content: [] })).toThrow(/declined/);
    expect(() => parseAnthropicResponse({ content: [] })).toThrow();
  });
});

describe('prompt caching', () => {
  const EPH = { type: 'ephemeral' };
  const chat: CompletionRequest = {
    system: 'You are a tutor.',
    messages: [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ],
  };

  it('anthropic: sends plain strings with no cache flag', () => {
    const body = buildAnthropicBody('claude-haiku-5-5', chat);
    expect(body.system).toBe('You are a tutor.');
    expect(body.messages).toEqual(chat.messages);
    expect(JSON.stringify(body)).not.toContain('cache_control');
  });

  it("anthropic: 'system' marks only the system prompt", () => {
    const body = buildAnthropicBody('claude-haiku-5-5', { ...chat, cache: 'system' });
    expect(body.system).toEqual([{ type: 'text', text: 'You are a tutor.', cache_control: EPH }]);
    expect(body.messages).toEqual(chat.messages);
    expect(body).not.toHaveProperty('cache_control');
  });

  it("anthropic: 'conversation' also marks the newest message, two breakpoints in all", () => {
    const body = buildAnthropicBody('claude-haiku-5-5', { ...chat, cache: 'conversation' });
    expect(body.system).toEqual([{ type: 'text', text: 'You are a tutor.', cache_control: EPH }]);
    expect(body.messages).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: [{ type: 'text', text: 'c', cache_control: EPH }] },
    ]);
    expect(JSON.stringify(body).match(/cache_control/g)).toHaveLength(2);
  });

  it('detects Anthropic models behind OpenRouter only', () => {
    expect(needsCacheMarkers('https://openrouter.ai/api/v1', 'anthropic/claude-haiku-5-5')).toBe(true);
    expect(needsCacheMarkers('https://OpenRouter.ai/api/v1/', 'Anthropic/claude-sonnet-5-5')).toBe(true);
    expect(needsCacheMarkers('https://openrouter.ai/api/v1', 'openai/gpt-6.1-sol')).toBe(false);
    expect(needsCacheMarkers('https://openrouter.ai/api/v1', 'google/gemini-flash-latest')).toBe(false);
    expect(needsCacheMarkers('https://openrouter.ai/api/v1', 'openrouter/free')).toBe(false);
    expect(needsCacheMarkers('https://api.openai.com/v1', 'anthropic/claude-haiku-5-5')).toBe(false);
    expect(needsCacheMarkers('https://openrouter.ai.evil.test/v1', 'anthropic/x')).toBe(false);
    expect(needsCacheMarkers('not a url', 'anthropic/x')).toBe(false);
  });

  it('openai-compatible: stays plain for automatic-prefix providers even with a cache flag', () => {
    const body = buildOpenAiBody('gpt-6.1-sol', { ...chat, cache: 'conversation' }, false, false);
    expect(body.messages).toEqual([{ role: 'system', content: 'You are a tutor.' }, ...chat.messages]);
    expect(JSON.stringify(body)).not.toContain('cache_control');
  });

  it("openrouter-anthropic: 'system' marks the system message as a content block", () => {
    const body = buildOpenAiBody('anthropic/claude-haiku-5-5', { ...chat, cache: 'system' }, false, true);
    expect(body.messages).toEqual([
      { role: 'system', content: [{ type: 'text', text: 'You are a tutor.', cache_control: EPH }] },
      ...chat.messages,
    ]);
  });

  it("openrouter-anthropic: 'conversation' also marks the newest message", () => {
    const body = buildOpenAiBody('anthropic/claude-haiku-5-5', { ...chat, cache: 'conversation' }, false, true);
    const messages = body.messages as unknown[];
    expect(messages[0]).toEqual({ role: 'system', content: [{ type: 'text', text: 'You are a tutor.', cache_control: EPH }] });
    expect(messages[1]).toEqual({ role: 'user', content: 'a' });
    expect(messages[3]).toEqual({ role: 'user', content: [{ type: 'text', text: 'c', cache_control: EPH }] });
  });

  it('openrouter-anthropic: no markers without a cache flag (one-off calls pay no write)', () => {
    const body = buildOpenAiBody('anthropic/claude-haiku-5-5', chat, false, true);
    expect(JSON.stringify(body)).not.toContain('cache_control');
  });

  it('sends markers over the wire only for OpenRouter Anthropic models', async () => {
    const ok = { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'x' } }] }), headers: { get: () => null } };
    const fetchMock = jest.fn().mockResolvedValue(ok);
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const cached = { ...chat, cache: 'system' as const };

    await completeOpenAiCompatible({ baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-haiku-5-5', apiKey: 'k' }, cached);
    await completeOpenAiCompatible({ baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat', apiKey: 'k' }, cached);
    expect(fetchMock.mock.calls[0][1].body).toContain('cache_control');
    expect(fetchMock.mock.calls[1][1].body).not.toContain('cache_control');
  });
});

describe('providers', () => {
  it('falls back to the provider default model', () => {
    expect(resolveModel(settings({}))).toBe(PROVIDERS.openrouter.defaultModel);
    expect(resolveModel(settings({ provider: 'anthropic' }))).toBe(PROVIDERS.anthropic.defaultModel);
    expect(resolveModel(settings({ model: ' custom/model ' }))).toBe('custom/model');
  });

  it('resolves the base url per provider', () => {
    expect(resolveBaseUrl(settings({ provider: 'openai' }))).toBe(PROVIDERS.openai.baseUrl);
    expect(resolveBaseUrl(settings({ baseUrl: '' }))).toBe(PROVIDERS.openrouter.baseUrl);
    expect(resolveBaseUrl(settings({ provider: 'openai', baseUrl: 'http://localhost:1234/v1/' }))).toBe('http://localhost:1234/v1');
    expect(resolveBaseUrl(settings({ provider: 'anthropic', baseUrl: 'http://elsewhere' }))).toBe(PROVIDERS.anthropic.baseUrl);
  });
});
