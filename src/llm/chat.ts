import { getBook } from '../db/books';
import { listCardsForBook } from '../db/cards';
import { listChapterHeads } from '../db/chapters';
import { addChatMessage, listChatMessages } from '../db/chat';
import { listTasks } from '../db/tasks';
import { applyPlan } from '../plan/applyPlan';
import { hasApiKey } from './apiKey';
import { parseChatReply } from './chatReply';
import { complete, type LlmMessage } from './client';
import { LlmError } from './errors';
import { CHAT_FALLBACKS, chatSystemPrompt } from './prompts';

// `days` is the number of days remaining that the reader asked for. `taskCount` is the
// book's total number of tasks afterwards, `completedCount` of which were already done.
export type ChatAction = { type: 'set_plan'; days: number; taskCount: number; completedCount: number };

const HISTORY_LIMIT = 12;

// Recent turns only, starting on a user turn as the Anthropic API requires.
function toHistory(messages: { role: 'user' | 'assistant'; content: string }[]): LlmMessage[] {
  const firstUser = messages.findIndex((m) => m.role === 'user');
  return firstUser === -1 ? [] : messages.slice(firstUser).map((m) => ({ role: m.role, content: m.content }));
}

export async function sendChatMessage(
  bookId: number,
  text: string,
): Promise<{ reply: string; action?: ChatAction }> {
  if (!(await hasApiKey())) throw new LlmError('no_key');
  const book = await getBook(bookId);
  if (!book) throw new LlmError('bad_response', 'This book no longer exists.');

  const [chapters, cards, tasks, previous] = await Promise.all([
    listChapterHeads(bookId),
    listCardsForBook(bookId),
    listTasks(bookId),
    listChatMessages(bookId, HISTORY_LIMIT),
  ]);
  // A failed or half-prepared book has cards too, but its content is incomplete.
  const cardsReady = cards.length > 0 && (book.status === 'ready' || book.status === 'finished');
  await addChatMessage(bookId, 'user', text);

  const raw = await complete({
    system: chatSystemPrompt({
      book,
      chapters,
      cardsReady,
      cardCount: cards.length,
      tasksTotal: tasks.length,
      tasksCompleted: tasks.filter((t) => t.completedAt !== null).length,
    }),
    messages: [...toHistory(previous), { role: 'user', content: text }],
  });

  const parsed = parseChatReply(raw);
  let reply = parsed.text;
  let action: ChatAction | undefined;

  if (parsed.action && cardsReady) {
    const { taskCount, completedCount } = await applyPlan(bookId, parsed.action.days);
    action = { type: 'set_plan', days: parsed.action.days, taskCount, completedCount };
    reply = reply || CHAT_FALLBACKS.planSet(parsed.action.days);
  } else if (parsed.action) {
    // The model's text may claim the plan was set; it was not, so say what is true.
    reply = CHAT_FALLBACKS.planNotReady;
  }
  reply = reply || CHAT_FALLBACKS.empty;

  await addChatMessage(bookId, 'assistant', reply);
  return action ? { reply, action } : { reply };
}
