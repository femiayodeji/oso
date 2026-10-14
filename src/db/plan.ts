import type { Plan, PlanCard } from '../plan/splitPlan';
import { withTransaction } from './index';
import { MAX_IN_PARAMS, chunk, placeholders } from './sql';

interface PlanCardRow {
  id: number;
  unit_idx: number;
  unit_title: string;
}

// The SQL half of applyPlan, in ONE transaction: drop the topic's incomplete sessions, hand
// the cards that are not in a completed session to `plan`, and store the sessions and plan_days
// it returns. Completed sessions keep their cards, title and completed_at; they are only
// renumbered to 0..n-1 (in their existing order) so session idx stays dense and new sessions
// follow them.
export async function replacePlanSessions(
  topicId: number,
  plan: (cards: PlanCard[], completedCount: number) => Plan,
): Promise<{ sessionCount: number; completedCount: number }> {
  return withTransaction(async (db) => {
    const topic = await db.getFirstAsync<{ id: number }>('SELECT id FROM topics WHERE id = ?', [
      topicId,
    ]);
    if (!topic) throw new Error(`Topic ${topicId} not found`);

    // New sessions get ids above every existing one. SQLite would otherwise reuse the ids
    // deleted below, and an open Today feed could not tell a new session from the old one.
    const last = await db.getFirstAsync<{ id: number | null }>('SELECT MAX(id) AS id FROM sessions', []);
    const firstNewId = (last?.id ?? 0) + 1;

    await db.runAsync('DELETE FROM sessions WHERE topic_id = ? AND completed_at IS NULL', [topicId]);

    const completed = await db.getAllAsync<{ id: number }>(
      'SELECT id FROM sessions WHERE topic_id = ? ORDER BY idx, id',
      [topicId],
    );
    for (let i = 0; i < completed.length; i++) {
      await db.runAsync('UPDATE sessions SET idx = ? WHERE id = ?', [i, completed[i].id]);
    }

    // ON DELETE SET NULL has already released the cards of the deleted sessions.
    const rows = await db.getAllAsync<PlanCardRow>(
      `SELECT c.id, ch.idx AS unit_idx, ch.title AS unit_title
       FROM cards c JOIN units ch ON ch.id = c.unit_id
       WHERE c.topic_id = ? AND c.session_id IS NULL
       ORDER BY ch.idx, c.idx, c.id`,
      [topicId],
    );
    const cards = rows.map((r) => ({
      id: r.id,
      unitIdx: r.unit_idx,
      unitTitle: r.unit_title,
    }));

    const { planDays, sessions: planned } = plan(cards, completed.length);
    for (let i = 0; i < planned.length; i++) {
      const sessionId = firstNewId + i;
      await db.runAsync('INSERT INTO sessions (id, topic_id, idx, title) VALUES (?, ?, ?, ?)', [
        sessionId,
        topicId,
        completed.length + i,
        planned[i].title,
      ]);
      for (const ids of chunk(planned[i].cardIds, MAX_IN_PARAMS)) {
        await db.runAsync(
          `UPDATE cards SET session_id = ? WHERE session_id IS NULL AND id IN (${placeholders(ids.length)})`,
          [sessionId, ...ids],
        );
      }
    }

    await db.runAsync('UPDATE topics SET plan_days = ? WHERE id = ?', [planDays, topicId]);
    if (planned.length > 0) {
      await db.runAsync("UPDATE topics SET status = 'ready' WHERE id = ? AND status = 'finished'", [
        topicId,
      ]);
    }

    return { sessionCount: completed.length + planned.length, completedCount: completed.length };
  });
}
