import { nowIso } from '../lib/dates';
import type { TopicStatus, Session } from '../types';
import { getDb, withTransaction } from './index';
import { initialReview } from './leitner';

export type SessionWithTopic = Session & { topicTitle: string };

interface SessionRow {
  id: number;
  topic_id: number;
  idx: number;
  title: string;
  completed_at: string | null;
}

interface SessionWithTopicRow extends SessionRow {
  topic_title: string;
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    topicId: row.topic_id,
    idx: row.idx,
    title: row.title,
    completedAt: row.completed_at,
  };
}

export async function listSessions(topicId: number): Promise<Session[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionRow>(
    'SELECT * FROM sessions WHERE topic_id = ? ORDER BY idx, id',
    [topicId],
  );
  return rows.map(toSession);
}

export async function getSession(id: number): Promise<Session | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id]);
  return row ? toSession(row) : null;
}

// One row per 'ready' topic: its lowest-idx incomplete session. Oldest topic first.
export async function listNextSessions(): Promise<SessionWithTopic[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionWithTopicRow>(
    `SELECT t.*, b.title AS topic_title
     FROM sessions t
     JOIN topics b ON b.id = t.topic_id
     WHERE b.status = 'ready'
       AND t.id = (
         SELECT n.id FROM sessions n
         WHERE n.topic_id = b.id AND n.completed_at IS NULL
         ORDER BY n.idx, n.id LIMIT 1
       )
     ORDER BY b.created_at, b.id`,
    [],
  );
  return rows.map((row) => ({ ...toSession(row), topicTitle: row.topic_title }));
}

// One transaction. Completing an already-completed session writes nothing, so the day's
// activity is never counted twice.
export async function completeSession(
  sessionId: number,
  today: string,
): Promise<{ topicFinished: boolean }> {
  return withTransaction(async (db) => {
    const session = await db.getFirstAsync<SessionRow>('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    if (session.completed_at === null) {
      await db.runAsync('UPDATE sessions SET completed_at = ? WHERE id = ?', [nowIso(), sessionId]);
      await db.runAsync(
        `INSERT INTO daily_activity (date, sessions_completed) VALUES (?, 1)
         ON CONFLICT(date) DO UPDATE SET sessions_completed = sessions_completed + 1`,
        [today],
      );
      const review = initialReview(today);
      await db.runAsync(
        "UPDATE cards SET box = ?, due_date = ? WHERE session_id = ? AND type IN ('recall','quiz')",
        [review.box, review.dueDate, sessionId],
      );
      await db.runAsync(
        `UPDATE topics SET status = 'finished'
         WHERE id = ? AND status = 'ready'
           AND NOT EXISTS (
             SELECT 1 FROM sessions WHERE topic_id = ? AND completed_at IS NULL
           )`,
        [session.topic_id, session.topic_id],
      );
    }

    const topic = await db.getFirstAsync<{ status: TopicStatus }>(
      'SELECT status FROM topics WHERE id = ?',
      [session.topic_id],
    );
    return { topicFinished: topic?.status === 'finished' };
  });
}
