import type { Plan, PlanCard } from '../plan/splitPlan';
import { withTransaction } from './index';
import { MAX_IN_PARAMS, chunk, placeholders } from './sql';

interface PlanCardRow {
  id: number;
  chapter_idx: number;
  chapter_title: string;
}

// The SQL half of applyPlan, in ONE transaction: drop the book's incomplete tasks, hand
// the cards that are not in a completed task to `plan`, and store the tasks and plan_days
// it returns. Completed tasks keep their cards, title and completed_at; they are only
// renumbered to 0..n-1 (in their existing order) so task idx stays dense and new tasks
// follow them.
export async function replacePlanTasks(
  bookId: number,
  plan: (cards: PlanCard[], completedCount: number) => Plan,
): Promise<{ taskCount: number; completedCount: number }> {
  return withTransaction(async (db) => {
    const book = await db.getFirstAsync<{ id: number }>('SELECT id FROM books WHERE id = ?', [
      bookId,
    ]);
    if (!book) throw new Error(`Book ${bookId} not found`);

    await db.runAsync('DELETE FROM tasks WHERE book_id = ? AND completed_at IS NULL', [bookId]);

    const completed = await db.getAllAsync<{ id: number }>(
      'SELECT id FROM tasks WHERE book_id = ? ORDER BY idx, id',
      [bookId],
    );
    for (let i = 0; i < completed.length; i++) {
      await db.runAsync('UPDATE tasks SET idx = ? WHERE id = ?', [i, completed[i].id]);
    }

    // ON DELETE SET NULL has already released the cards of the deleted tasks.
    const rows = await db.getAllAsync<PlanCardRow>(
      `SELECT c.id, ch.idx AS chapter_idx, ch.title AS chapter_title
       FROM cards c JOIN chapters ch ON ch.id = c.chapter_id
       WHERE c.book_id = ? AND c.task_id IS NULL
       ORDER BY ch.idx, c.idx, c.id`,
      [bookId],
    );
    const cards = rows.map((r) => ({
      id: r.id,
      chapterIdx: r.chapter_idx,
      chapterTitle: r.chapter_title,
    }));

    const { planDays, tasks: planned } = plan(cards, completed.length);
    for (let i = 0; i < planned.length; i++) {
      const inserted = await db.runAsync(
        'INSERT INTO tasks (book_id, idx, title) VALUES (?, ?, ?)',
        [bookId, completed.length + i, planned[i].title],
      );
      for (const ids of chunk(planned[i].cardIds, MAX_IN_PARAMS)) {
        await db.runAsync(
          `UPDATE cards SET task_id = ? WHERE task_id IS NULL AND id IN (${placeholders(ids.length)})`,
          [inserted.lastInsertRowId, ...ids],
        );
      }
    }

    await db.runAsync('UPDATE books SET plan_days = ? WHERE id = ?', [planDays, bookId]);
    if (planned.length > 0) {
      await db.runAsync("UPDATE books SET status = 'ready' WHERE id = ? AND status = 'finished'", [
        bookId,
      ]);
    }

    return { taskCount: completed.length + planned.length, completedCount: completed.length };
  });
}
