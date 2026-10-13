import { buildAnthropicBody, parseAnthropicResponse } from '../adapters/anthropic';
import { buildOpenAiBody, canUseJsonMode, completeOpenAiCompatible, parseOpenAiResponse } from '../adapters/openaiCompatible';
import type { CompletionRequest } from '../jsonCompletion';
import { PROVIDERS, resolveBaseUrl, resolveModel } from '../providers';
import type { AppSettings } from '../../types';

const req: CompletionRequest = { system: 'Return JSON only.', messages: [{ role: 'user', content: 'hi' }], json: true };

const settings = (patch: Partial<AppSettings>): AppSettings => ({
  provider: 'openrouter', baseUrl: PROVIDERS.openrouter.baseUrl, model: '', reminderEvening: '18:00',
  reminderLate: '21:00', colorScheme: 'system', soundsEnabled: true, bestStreak: 0, ...patch,
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
