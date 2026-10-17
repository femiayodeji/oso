import { getTopic } from '../db/topics';
import { listCardsForTopic } from '../db/cards';
import { listUnitHeads } from '../db/units';
import { addChatMessage, listChatMessages } from '../db/chat';
import { listSessions } from '../db/sessions';
import { applyPlan } from '../plan/applyPlan';
import { hasApiKey } from './apiKey';
import { parseChatReply } from './chatReply';
import { complete, type LlmMessage } from './client';
import { LlmError } from './errors';
import { CHAT_FALLBACKS, chatSystemPrompt } from './prompts';

// `days` is the number of days remaining that the reader asked for. `sessionCount` is the
// topic's total number of sessions afterwards, `completedCount` of which were already done.
// `cardsLeft` is how many cards those remaining days hold.
export type ChatAction = {
  type: 'set_plan';
  days: number;
  sessionCount: number;
  completedCount: number;
  cardsLeft: number;
};

const HISTORY_LIMIT = 12;

// Recent turns only, starting on a user turn as the Anthropic API requires.
function toHistory(messages: { role: 'user' | 'assistant'; content: string }[]): LlmMessage[] {
  const firstUser = messages.findIndex((m) => m.role === 'user');
  return firstUser === -1 ? [] : messages.slice(firstUser).map((m) => ({ role: m.role, content: m.content }));
}

export async function sendChatMessage(
  topicId: number,
  text: string,
): Promise<{ reply: string; action?: ChatAction }> {
  if (!(await hasApiKey())) throw new LlmError('no_key');
  const topic = await getTopic(topicId);
  if (!topic) throw new LlmError('bad_response', 'This topic no longer exists.');

  const [units, cards, sessions, previous] = await Promise.all([
    listUnitHeads(topicId),
    listCardsForTopic(topicId),
    listSessions(topicId),
    listChatMessages(topicId, HISTORY_LIMIT),
  ]);
  // A failed or half-prepared topic has cards too, but its content is incomplete.
  const cardsReady = cards.length > 0 && (topic.status === 'ready' || topic.status === 'finished');
  const completed = new Set(sessions.filter((t) => t.completedAt !== null).map((t) => t.id));
  const cardsLeft = cards.filter((c) => c.sessionId === null || !completed.has(c.sessionId)).length;
  await addChatMessage(topicId, 'user', text);

  const raw = await complete({
    system: chatSystemPrompt({
      topic,
      units,
      cardsReady,
      cardCount: cards.length,
      cardsLeft,
      sessionsTotal: sessions.length,
      sessionsCompleted: completed.size,
    }),
    messages: [...toHistory(previous), { role: 'user', content: text }],
  });

  const parsed = parseChatReply(raw);
  let reply = parsed.text;
  let action: ChatAction | undefined;

  if (parsed.action && cardsReady) {
    const { sessionCount, completedCount } = await applyPlan(topicId, parsed.action.days);
    action = { type: 'set_plan', days: parsed.action.days, sessionCount, completedCount, cardsLeft };
    reply = reply || CHAT_FALLBACKS.planSet(parsed.action.days);
  } else if (parsed.action) {
    // The model's text may claim the plan was set; it was not, so say what is true.
    reply = CHAT_FALLBACKS.planNotReady;
  }
  reply = reply || CHAT_FALLBACKS.empty;

  await addChatMessage(topicId, 'assistant', reply);
  return action ? { reply, action } : { reply };
}
