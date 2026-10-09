import { CHECK_SETTINGS, LlmError } from './errors';

export type PostJsonOptions = {
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  // Values that must never appear in an error message (the API key).
  secrets?: string[];
};

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1_000;
const MAX_WAIT_MS = 30_000;
const MAX_DETAIL_CHARS = 200;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export function backoffDelay(attempt: number, retryAfterMs: number | null): number {
  const wait = retryAfterMs ?? BASE_BACKOFF_MS * 2 ** attempt;
  return Math.min(wait, MAX_WAIT_MS);
}

function scrub(text: string, secrets: string[]): string {
  return secrets.reduce((acc, s) => (s ? acc.split(s).join('[key]') : acc), text);
}

function errorDetail(bodyText: string, secrets: string[]): string {
  let detail = '';
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (parsed && typeof parsed === 'object') {
      const err = (parsed as { error?: unknown }).error;
      if (typeof err === 'string') detail = err;
      else if (err && typeof err === 'object') {
        const msg = (err as { message?: unknown }).message;
        if (typeof msg === 'string') detail = msg;
      }
    }
  } catch {
    detail = '';
  }
  return scrub(detail, secrets).replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL_CHARS);
}

export function mapHttpError(status: number, bodyText: string, secrets: string[] = []): LlmError {
  if (status === 401) return new LlmError('invalid_key', undefined, status);
  if (status === 429) return new LlmError('rate_limit', undefined, status);
  if (status >= 500) return new LlmError('server', undefined, status);
  // Any other 4xx (400, 403, 404, 422...) is a request the provider will keep rejecting,
  // usually because of a wrong model name or base URL. 403 belongs here too: providers
  // send it for a model the key may not use, not for a bad key, so show their reason.
  const detail = errorDetail(bodyText, secrets).replace(/[.\s]+$/, '');
  const rejected = `The provider rejected the request (${status})`;
  return new LlmError('bad_request', `${rejected}${detail ? `: ${detail}` : ''}. ${CHECK_SETTINGS}`, status);
}

async function fetchOnce(
  url: string,
  opts: PostJsonOptions,
): Promise<{ status: number; ok: boolean; text: string; retryAfter: string | null }> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...opts.headers },
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text, retryAfter: res.headers.get('retry-after') };
  } catch {
    throw new LlmError(timedOut ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

// POSTs JSON and returns the parsed JSON body. Retries 429 and 5xx with backoff,
// honoring Retry-After. All failures surface as LlmError.
export async function postJson(url: string, opts: PostJsonOptions): Promise<unknown> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchOnce(url, opts);
    if (res.ok) {
      try {
        return JSON.parse(res.text) as unknown;
      } catch {
        throw new LlmError('bad_response');
      }
    }
    if (isRetryableStatus(res.status) && attempt < maxRetries) {
      await sleep(backoffDelay(attempt, parseRetryAfter(res.retryAfter)));
      continue;
    }
    throw mapHttpError(res.status, res.text, opts.secrets);
  }
}
