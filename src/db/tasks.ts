import { nowIso } from '../lib/dates';
import type { BookStatus, Task } from '../types';
import { getDb, withTransaction, write } from './index';
import { initialReview } from './leitner';

export type TaskWithBook = Task & { bookTitle: string; cardCount: number; totalTasks: number };

interface TaskRow {
  id: number;
  book_id: number;
  idx: number;
  title: string;
  completed_at: string | null;
}

interface TaskWithBookRow extends TaskRow {
  book_title: string;
  card_count: number;
  total_tasks: number;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    bookId: row.book_id,
    idx: row.idx,
    title: row.title,
    completedAt: row.completed_at,
  };
}

export async function listTasks(bookId: number): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TaskRow>(
    'SELECT * FROM tasks WHERE book_id = ? ORDER BY idx, id',
    [bookId],
  );
  return rows.map(toTask);
}

export async function getTask(id: number): Promise<Task | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  return row ? toTask(row) : null;
}

// One row per 'ready' book: its lowest-idx incomplete task. Oldest book first.
export async function listNextTasks(): Promise<TaskWithBook[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TaskWithBookRow>(
    `SELECT t.*, b.title AS book_title,
       (SELECT COUNT(*) FROM cards c WHERE c.task_id = t.id) AS card_count,
       (SELECT COUNT(*) FROM tasks a WHERE a.book_id = t.book_id) AS total_tasks
     FROM tasks t
     JOIN books b ON b.id = t.book_id
     WHERE b.status = 'ready'
       AND t.id = (
         SELECT n.id FROM tasks n
         WHERE n.book_id = b.id AND n.completed_at IS NULL
         ORDER BY n.idx, n.id LIMIT 1
       )
     ORDER BY b.created_at, b.id`,
    [],
  );
  return rows.map((row) => ({
    ...toTask(row),
    bookTitle: row.book_title,
    cardCount: row.card_count,
    totalTasks: row.total_tasks,
  }));
}

export async function listUpcomingTasks(bookId: number): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TaskRow>(
    'SELECT * FROM tasks WHERE book_id = ? AND completed_at IS NULL ORDER BY idx, id',
    [bookId],
  );
  return rows.map(toTask);
}

export async function deleteTasksForBook(bookId: number): Promise<void> {
  await write('DELETE FROM tasks WHERE book_id = ?', [bookId]);
}

// One transaction. Completing an already-completed task writes nothing, so the day's
// activity is never counted twice.
export async function completeTask(
  taskId: number,
  today: string,
): Promise<{ bookFinished: boolean }> {
  return withTransaction(async (db) => {
    const task = await db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) throw new Error(`Task ${taskId} not found`);

    if (task.completed_at === null) {
      await db.runAsync('UPDATE tasks SET completed_at = ? WHERE id = ?', [nowIso(), taskId]);
      await db.runAsync(
        `INSERT INTO daily_activity (date, tasks_completed) VALUES (?, 1)
         ON CONFLICT(date) DO UPDATE SET tasks_completed = tasks_completed + 1`,
        [today],
      );
      const review = initialReview(today);
      await db.runAsync(
        "UPDATE cards SET box = ?, due_date = ? WHERE task_id = ? AND type = 'recall'",
        [review.box, review.dueDate, taskId],
      );
      await db.runAsync(
        `UPDATE books SET status = 'finished'
         WHERE id = ? AND status = 'ready'
           AND NOT EXISTS (
             SELECT 1 FROM tasks WHERE book_id = ? AND completed_at IS NULL
           )`,
        [task.book_id, task.book_id],
      );
    }

    const book = await db.getFirstAsync<{ status: BookStatus }>(
      'SELECT status FROM books WHERE id = ?',
      [task.book_id],
    );
    return { bookFinished: book?.status === 'finished' };
  });
}
