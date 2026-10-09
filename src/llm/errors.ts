export type LlmErrorKind =
  | 'no_key'
  | 'invalid_key'
  | 'rate_limit'
  | 'network'
  | 'timeout'
  | 'server'
  | 'bad_response';

const DEFAULT_MESSAGES: Record<LlmErrorKind, string> = {
  no_key: 'Add an API key in Settings to continue.',
  invalid_key: 'The API key was rejected. Check it in Settings.',
  rate_limit: 'The provider is rate limiting requests. Try again in a minute.',
  network: 'No connection. Check your internet and try again.',
  timeout: 'The request took too long. Try again.',
  server: 'The provider had a problem. Try again later.',
  bad_response: 'The model returned an unusable answer. Try again.',
};

// `message` is always safe to show: it never contains the key, headers, or prompts.
export class LlmError extends Error {
  kind: LlmErrorKind;
  status?: number;

  constructor(kind: LlmErrorKind, message?: string, status?: number) {
    super(message ?? DEFAULT_MESSAGES[kind]);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = status;
  }
}

export function isLlmError(e: unknown): e is LlmError {
  return e instanceof LlmError;
}

export function isNoKeyError(e: unknown): boolean {
  return e instanceof LlmError && e.kind === 'no_key';
}

export function describeLlmError(e: unknown): string {
  if (e instanceof LlmError) return e.message;
  return 'Something went wrong. Try again.';
}
