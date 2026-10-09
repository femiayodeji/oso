import { describeLlmError, isNoKeyError, LlmError } from '../errors';
import { backoffDelay, mapHttpError, parseRetryAfter, postJson } from '../http';

const KEY = 'sk-test-secret-123';

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  };
}

const fetchMock = jest.fn();
const sleep = jest.fn(async (_ms: number) => undefined);
const call = (extra: Partial<Parameters<typeof postJson>[1]> = {}) =>
  postJson('https://example.test/v1/x', { headers: { authorization: `Bearer ${KEY}` }, body: { a: 1 }, sleep, secrets: [KEY], ...extra });

beforeEach(() => {
  fetchMock.mockReset();
  sleep.mockClear();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
});

describe('postJson', () => {
  it('posts JSON and returns the parsed body', async () => {
    fetchMock.mockResolvedValueOnce(response(200, { ok: true }));
    await expect(call()).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/v1/x');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers['content-type']).toBe('application/json');
  });

  it('maps 401 to invalid_key without retrying', async () => {
    fetchMock.mockResolvedValue(response(401, { error: { message: `bad key ${KEY}` } }));
    const error = (await call().catch((e: unknown) => e)) as LlmError;
    expect(error.kind).toBe('invalid_key');
    expect(error.message).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps 403 to bad_request and keeps the provider reason', async () => {
    fetchMock.mockResolvedValue(response(403, { error: { message: 'This model is not available to you.' } }));
    const error = (await call().catch((e: unknown) => e)) as LlmError;
    expect(error.kind).toBe('bad_request');
    expect(error.message).toContain('This model is not available to you');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 429 with exponential backoff, then reports rate_limit', async () => {
    fetchMock.mockResolvedValue(response(429, {}));
    await expect(call()).rejects.toMatchObject({ kind: 'rate_limit', status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it('honors Retry-After', async () => {
    fetchMock
      .mockResolvedValueOnce(response(429, {}, { 'retry-after': '7' }))
      .mockResolvedValueOnce(response(200, { ok: true }));
    await expect(call()).resolves.toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('retries 5xx and recovers', async () => {
    fetchMock.mockResolvedValueOnce(response(503, 'busy')).mockResolvedValueOnce(response(200, { ok: 1 }));
    await expect(call()).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps a persistent 5xx to server', async () => {
    fetchMock.mockResolvedValue(response(500, 'oops'));
    await expect(call({ maxRetries: 1 })).rejects.toMatchObject({ kind: 'server' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry other 4xx and scrubs the key from the detail', async () => {
    fetchMock.mockResolvedValue(response(404, { error: { message: `No such model for ${KEY}` } }));
    const error = (await call().catch((e: unknown) => e)) as LlmError;
    expect(error.kind).toBe('bad_request');
    expect(error.status).toBe(404);
    expect(error.message).toContain('No such model');
    expect(error.message).toMatch(/model name and base URL in Settings/);
    expect(error.message).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a fetch failure to network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(call()).rejects.toMatchObject({ kind: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts and maps to timeout', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );
    await expect(call({ timeoutMs: 10 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('maps a non-JSON success body to bad_response', async () => {
    fetchMock.mockResolvedValue(response(200, '<html>'));
    await expect(call()).rejects.toMatchObject({ kind: 'bad_response' });
  });
});

describe('helpers', () => {
  it('parses Retry-After seconds and dates', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('nonsense')).toBeNull();
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:05 GMT', now)).toBe(5000);
  });

  it('caps the wait', () => {
    expect(backoffDelay(0, null)).toBe(1000);
    expect(backoffDelay(2, null)).toBe(4000);
    expect(backoffDelay(0, 600_000)).toBe(30_000);
  });

  it('maps statuses', () => {
    expect(mapHttpError(401, '').kind).toBe('invalid_key');
    expect(mapHttpError(429, '').kind).toBe('rate_limit');
    expect(mapHttpError(529, '').kind).toBe('server');
    expect(mapHttpError(400, 'not json').message).toContain('400');
  });

  it('gives a rejected request its own kind and points at Settings', () => {
    for (const status of [400, 404, 422]) expect(mapHttpError(status, '').kind).toBe('bad_request');
    expect(mapHttpError(404, '').message).toBe(
      'The provider rejected the request (404). Check the model name and base URL in Settings.',
    );
    expect(mapHttpError(400, JSON.stringify({ error: { message: 'Unknown model: gpt-9.' } })).message).toBe(
      'The provider rejected the request (400): Unknown model: gpt-9. Check the model name and base URL in Settings.',
    );
    expect(new LlmError('bad_request').message).toMatch(/Settings/);
  });

  it('describes errors without leaking internals', () => {
    expect(isNoKeyError(new LlmError('no_key'))).toBe(true);
    expect(isNoKeyError(new Error('x'))).toBe(false);
    expect(describeLlmError(new Error(`boom ${KEY}`))).not.toContain(KEY);
    expect(describeLlmError(new LlmError('network'))).toMatch(/connection/i);
  });
});
