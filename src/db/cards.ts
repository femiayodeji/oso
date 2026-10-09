import type { Card, CardType } from '../types';
import { getDb, withTransaction, write } from './index';
import { nextReview } from './leitner';

export type NewCard = { idx: number; type: CardType; front: string; back?: string | null };

interface CardRow {
  id: number;
  book_id: number;
  chapter_id: number;
  task_id: number | null;
  idx: number;
  type: CardType;
  front: string;
  back: string | null;
  flagged: number;
  box: number;
  due_date: string | null;
}

const DEFAULT_REVIEW_LIMIT = 20;

const READING_ORDER = 'ch.idx, c.idx, c.id';
const SELECT_CARDS = 'SELECT c.* FROM cards c JOIN chapters ch ON ch.id = c.chapter_id';

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    bookId: row.book_id,
    chapterId: row.chapter_id,
    taskId: row.task_id,
    idx: row.idx,
    type: row.type,
    front: row.front,
    back: row.back,
    flagged: row.flagged !== 0,
    box: row.box,
    dueDate: row.due_date,
  };
}

// Cards that belong to a completed task are immutable and are kept as they are; only the
// chapter's other cards are replaced. New cards have no task until applyPlan runs.
export async function replaceCardsForChapter(
  bookId: number,
  chapterId: number,
  cards: NewCard[],
): Promise<void> {
  await withTransaction(async (db) => {
    await db.runAsync(
      `DELETE FROM cards
       WHERE chapter_id = ?
         AND (task_id IS NULL
              OR task_id IN (SELECT id FROM tasks WHERE completed_at IS NULL))`,
      [chapterId],
    );
    for (const card of cards) {
      await db.runAsync(
        `INSERT INTO cards (book_id, chapter_id, idx, type, front, back)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [bookId, chapterId, card.idx, card.type, card.front, card.back ?? null],
      );
    }
  });
}

export async function getCard(id: number): Promise<Card | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CardRow>('SELECT * FROM cards WHERE id = ?', [id]);
  return row ? toCard(row) : null;
}

export async function listCardsForTask(taskId: number): Promise<Card[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CardRow>(
    `${SELECT_CARDS} WHERE c.task_id = ? ORDER BY ${READING_ORDER}`,
    [taskId],
  );
  return rows.map(toCard);
}

export async function listCardsForBook(bookId: number): Promise<Card[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CardRow>(
    `${SELECT_CARDS} WHERE c.book_id = ? ORDER BY ${READING_ORDER}`,
    [bookId],
  );
  return rows.map(toCard);
}

// Replaces the card's text (an omitted `back` becomes NULL) and clears the flag.
export async function updateCardContent(
  id: number,
  content: { type?: CardType; front: string; back?: string | null },
): Promise<void> {
  await write(
    'UPDATE cards SET type = COALESCE(?, type), front = ?, back = ?, flagged = 0 WHERE id = ?',
    [content.type ?? null, content.front, content.back ?? null, id],
  );
}

export async function setCardFlagged(id: number, flagged: boolean): Promise<void> {
  await write('UPDATE cards SET flagged = ? WHERE id = ?', [flagged ? 1 : 0, id]);
}

// Recall cards from completed tasks that are due, most overdue first.
export async function listDueReviewCards(
  today: string,
  opts?: { excludeTaskId?: number; limit?: number },
): Promise<Card[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CardRow>(
    `SELECT c.* FROM cards c
     JOIN tasks t ON t.id = c.task_id
     WHERE c.type = 'recall'
       AND t.completed_at IS NOT NULL
       AND c.due_date IS NOT NULL
       AND c.due_date <= ?
       AND c.task_id IS NOT ?
     ORDER BY c.due_date, c.id
     LIMIT ?`,
    [today, opts?.excludeTaskId ?? null, opts?.limit ?? DEFAULT_REVIEW_LIMIT],
  );
  return rows.map(toCard);
}

export async function reviewCard(id: number, remembered: boolean, today: string): Promise<void> {
  await withTransaction(async (db) => {
    const row = await db.getFirstAsync<{ box: number }>('SELECT box FROM cards WHERE id = ?', [
      id,
    ]);
    if (!row) return;
    const next = nextReview(row.box, remembered, today);
    await db.runAsync('UPDATE cards SET box = ?, due_date = ? WHERE id = ?', [
      next.box,
      next.dueDate,
      id,
    ]);
  });
}
