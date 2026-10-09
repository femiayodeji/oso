import { findJsonSpans } from './json';
import { chatActionSchema, type ParsedChatAction } from './schemas';

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function tidy(text: string): string {
  return text
    .replace(/```[a-zA-Z0-9_-]*\s*```/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Splits a chat reply into the text to show and an optional validated action.
// Any JSON object carrying an "action" key is removed from the visible text, valid
// or not; only one that passes the schema is returned. Plain prose never yields an action.
export function parseChatReply(raw: string): { text: string; action?: ParsedChatAction } {
  let text = raw;
  let action: ParsedChatAction | undefined;
  const spans = findJsonSpans(raw, '{').reverse();
  for (const span of spans) {
    const obj = parseObject(raw.slice(span.start, span.end));
    if (!obj || !('action' in obj)) continue;
    text = text.slice(0, span.start) + text.slice(span.end);
    const result = chatActionSchema.safeParse(obj);
    if (result.success && !action) action = result.data;
  }
  const visible = tidy(text);
  return action ? { text: visible, action } : { text: visible };
}
