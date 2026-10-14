import type { Card, CardType } from '../types';
import { getDb, withTransaction, write } from './index';
import { nextReview } from './leitner';

export type NewCard = {
  idx: number;
  type: CardType;
  front: string;
  back?: string | null;
  options?: string[] | null;
  answerIdx?: number | null;
};

const TESTING_SQL = "('recall','quiz')";

interface CardRow {
  id: number;
  topic_id: number;
  unit_id: number;
  session_id: number | null;
  idx: number;
  type: CardType;
  front: string;
  back: string | null;
  options: string | null;
  answer_idx: number | null;
  flagged: number;
  box: number;
  due_date: string | null;
}

const DEFAULT_REVIEW_LIMIT = 20;

const READING_ORDER = 'ch.idx, c.idx, c.id';
const SELECT_CARDS = 'SELECT c.* FROM cards c JOIN units ch ON ch.id = c.unit_id';

// Stored as a JSON array; anything unreadable counts as no options.
function parseOptions(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every((o) => typeof o === 'string') ? value : null;
  } catch {
    return null;
  }
}

function optionsJson(options: string[] | null | undefined): string | null {
  return options && options.length > 0 ? JSON.stringify(options) : null;
}

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    topicId: row.topic_id,
    unitId: row.unit_id,
    sessionId: row.session_id,
    idx: row.idx,
    type: row.type,
    front: row.front,
    back: row.back,
    options: parseOptions(row.options),
    answerIdx: row.answer_idx,
    flagged: row.flagged !== 0,
    box: row.box,
    dueDate: row.due_date,
  };
}

// Cards that belong to a completed session are immutable and are kept as they are; only the
// unit's other cards are replaced. New cards have no session until applyPlan runs.
export async function replaceCardsForUnit(
  topicId: number,
  unitId: number,
  cards: NewCard[],
): Promise<void> {
  await withTransaction(async (db) => {
    await db.runAsync(
      `DELETE FROM cards
       WHERE unit_id = ?
         AND (session_id IS NULL
              OR session_id IN (SELECT id FROM sessions WHERE completed_at IS NULL))`,
      [unitId],
    );
    for (const card of cards) {
      await db.runAsync(
        `INSERT INTO cards (topic_id, unit_id, idx, type, front, back, options, answer_idx)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [topicId, unitId, card.idx, card.type, card.front, card.back ?? null, optionsJson(card.options), card.answerIdx ?? null],
      );
    }
  });
}

export async function getCard(id: number): Promise<Card | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CardRow>('SELECT * FROM cards WHERE id = ?', [id]);
  return row ? toCard(row) : null;
}

export async function listCardsForSession(sessionId: number): Promise<Card[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CardRow>(
    `${SELECT_CARDS} WHERE c.session_id = ? ORDER BY ${READING_ORDER}`,
    [sessionId],
  );
  return rows.map(toCard);
}

export async function listCardsForTopic(topicId: number): Promise<Card[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CardRow>(
    `${SELECT_CARDS} WHERE c.topic_id = ? ORDER BY ${READING_ORDER}`,
    [topicId],
  );
  return rows.map(toCard);
}

// Replaces the card's content (omitted fields become NULL) and clears the flag.
export async function updateCardContent(
  id: number,
  content: { type?: CardType; front: string; back?: string | null; options?: string[] | null; answerIdx?: number | null },
): Promise<void> {
  await write(
    `UPDATE cards SET type = COALESCE(?, type), front = ?, back = ?, options = ?, answer_idx = ?, flagged = 0
     WHERE id = ?`,
    [content.type ?? null, content.front, content.back ?? null, optionsJson(content.options), content.answerIdx ?? null, id],
  );
}

export async function setCardFlagged(id: number, flagged: boolean): Promise<void> {
  await write('UPDATE cards SET flagged = ? WHERE id = ?', [flagged ? 1 : 0, id]);
}

// Recall and quiz cards from completed sessions that are due, most overdue first.
export async function listDueReviewCards(
  today: string,
  opts?: { excludeSessionId?: number; limit?: number },
): Promise<Card[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CardRow>(
    `SELECT c.* FROM cards c
     JOIN sessions t ON t.id = c.session_id
     WHERE c.type IN ${TESTING_SQL}
       AND t.completed_at IS NOT NULL
       AND c.due_date IS NOT NULL
       AND c.due_date <= ?
       AND c.session_id IS NOT ?
     ORDER BY c.due_date, c.id
     LIMIT ?`,
    [today, opts?.excludeSessionId ?? null, opts?.limit ?? DEFAULT_REVIEW_LIMIT],
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
