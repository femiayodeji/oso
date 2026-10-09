// Pure helpers for pulling JSON out of model replies.

export type Span = { start: number; end: number }; // end is exclusive

const FENCE_RE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/;

export function stripCodeFences(raw: string): string {
  const match = FENCE_RE.exec(raw);
  if (match) return match[1].trim();
  return raw.replace(/^\s*```[a-zA-Z0-9_-]*\s*/, '').trim();
}

function matchBalanced(text: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

// Top-level balanced {...} / [...] spans, in order. String-aware, so braces inside
// JSON strings do not confuse it.
export function findJsonSpans(text: string, openers: string = '{['): Span[] {
  const spans: Span[] = [];
  let i = 0;
  while (i < text.length) {
    if (openers.includes(text[i])) {
      const end = matchBalanced(text, i);
      if (end !== -1) {
        spans.push({ start: i, end });
        i = end;
        continue;
      }
    }
    i++;
  }
  return spans;
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

// Returns the JSON text found in a reply: fenced block, bare JSON, or JSON
// embedded in prose. Null when nothing parses.
export function extractJson(raw: string): string | null {
  for (const candidate of [raw.trim(), stripCodeFences(raw)]) {
    if (/^[{[]/.test(candidate) && tryParse(candidate).ok) return candidate;
  }
  for (const span of findJsonSpans(raw)) {
    const candidate = raw.slice(span.start, span.end);
    if (tryParse(candidate).ok) return candidate;
  }
  return null;
}

export function parseJsonLoose(raw: string): unknown {
  const text = extractJson(raw);
  if (text === null) throw new Error('The reply did not contain valid JSON.');
  return JSON.parse(text) as unknown;
}
