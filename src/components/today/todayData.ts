import { getStreak } from '../../db/activity';
import { getTopic, listTopics } from '../../db/topics';
import { listCardsForTopic, listDueReviewCards } from '../../db/cards';
import { getUnitProgress } from '../../db/units';
import { getLastTopicId } from '../../db/settings';
import { getSession, listNextSessions, listSessions, type SessionWithTopic } from '../../db/sessions';
import { todayLocal } from '../../lib/dates';
import { hasApiKey } from '../../llm/apiKey';
import type { Topic, StreakInfo } from '../../types';

export interface ActiveSession {
  id: number;
  topicId: number;
  title: string;
  topicTitle: string;
}

export const REVIEW_LABEL = 'Review due cards';

export interface TodayData {
  hasKey: boolean;
  topics: Topic[];
  nextSessions: SessionWithTopic[];
  streak: StreakInfo;
  // Unit progress of the first topic still being prepared, if any.
  preparing: { topic: Topic; done: number; total: number } | null;
  // Whether any recall card from a completed session is due today.
  hasDueReviews: boolean;
  // The topic last read here; Today opens on it while it has a session left.
  lastTopicId: number | null;
}

export interface Recap {
  topicTitle: string;
  sessions: number;
  cards: number;
}

export async function loadToday(): Promise<TodayData> {
  const [hasKey, topics, nextSessions, streak, due, lastTopicId] = await Promise.all([
    hasApiKey(),
    listTopics(),
    listNextSessions(),
    getStreak(),
    listDueReviewCards(todayLocal(), { limit: 1 }),
    getLastTopicId(),
  ]);
  const pending = topics.find((b) => b.status === 'generating' || b.status === 'draft');
  const preparing = pending ? { topic: pending, ...(await getUnitProgress(pending.id)) } : null;
  return { hasKey, topics, nextSessions, streak, preparing, hasDueReviews: due.length > 0, lastTopicId };
}

// A session opened from the topic screen. Completed or missing sessions are ignored.
export async function loadSessionById(sessionId: number): Promise<ActiveSession | null> {
  const session = await getSession(sessionId);
  if (!session || session.completedAt) return null;
  const topic = await getTopic(session.topicId);
  if (!topic) return null;
  return { id: session.id, topicId: session.topicId, title: session.title, topicTitle: topic.title };
}

export async function loadRecap(topicId: number, topicTitle: string): Promise<Recap> {
  const [sessions, cards] = await Promise.all([listSessions(topicId), listCardsForTopic(topicId)]);
  return { topicTitle, sessions: sessions.length, cards: cards.length };
}
