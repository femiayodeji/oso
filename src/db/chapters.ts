import type { SQLiteDatabase } from 'expo-sqlite';

import type { Chapter, GenStatus } from '../types';
import { getDb, withTransaction, write } from './index';
import { buildSet } from './sql';

interface ChapterRow {
  id: number;
  book_id: number;
  idx: number;
  title: string;
  source_text: string | null;
  summary: string | null;
  gen_status: GenStatus;
}

// A chapter without its source text, which can be most of a book for uploaded files.
export type ChapterHead = Omit<Chapter, 'sourceText'>;

type ChapterHeadRow = Omit<ChapterRow, 'source_text'>;

type NewChapter = { idx: number; title: string; sourceText?: string | null };

type ChapterPatch = Partial<Pick<Chapter, 'title' | 'sourceText' | 'summary' | 'genStatus'>>;

const PATCH_COLUMNS: { [K in keyof ChapterPatch]-?: string } = {
  title: 'title',
  sourceText: 'source_text',
  summary: 'summary',
  genStatus: 'gen_status',
};

function toHead(row: ChapterHeadRow): ChapterHead {
  return {
    id: row.id,
    bookId: row.book_id,
    idx: row.idx,
    title: row.title,
    summary: row.summary,
    genStatus: row.gen_status,
  };
}

function toChapter(row: ChapterRow): Chapter {
  return { ...toHead(row), sourceText: row.source_text };
}

async function insertRows(db: SQLiteDatabase, bookId: number, chapters: NewChapter[]): Promise<void> {
  for (const chapter of chapters) {
    await db.runAsync(
      'INSERT INTO chapters (book_id, idx, title, source_text) VALUES (?, ?, ?, ?)',
      [bookId, chapter.idx, chapter.title, chapter.sourceText ?? null],
    );
  }
}

export async function insertChapters(bookId: number, chapters: NewChapter[]): Promise<void> {
  if (chapters.length === 0) return;
  await withTransaction((db) => insertRows(db, bookId, chapters));
}

// Everything about the book's chapters except source_text. Use getChapter() for the one
// chapter whose text is needed.
export async function listChapterHeads(bookId: number): Promise<ChapterHead[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ChapterHeadRow>(
    'SELECT id, book_id, idx, title, summary, gen_status FROM chapters WHERE book_id = ? ORDER BY idx, id',
    [bookId],
  );
  return rows.map(toHead);
}

export async function getChapter(id: number): Promise<Chapter | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ChapterRow>('SELECT * FROM chapters WHERE id = ?', [id]);
  return row ? toChapter(row) : null;
}

export async function updateChapter(id: number, patch: ChapterPatch): Promise<void> {
  const set = buildSet(patch, PATCH_COLUMNS);
  if (!set) return;
  await write(`UPDATE chapters SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

// Content swap for a regenerate, in ONE transaction: the old chapters, cards and tasks
// go (a task is nothing but its cards) and the new outline takes their place, so the book
// is never left without chapters. daily_activity is never touched.
export async function replaceChaptersForBook(bookId: number, chapters: NewChapter[]): Promise<void> {
  await withTransaction(async (db) => {
    await db.runAsync('DELETE FROM chapters WHERE book_id = ?', [bookId]);
    await db.runAsync('DELETE FROM cards WHERE book_id = ?', [bookId]);
    await db.runAsync('DELETE FROM tasks WHERE book_id = ?', [bookId]);
    await insertRows(db, bookId, chapters);
  });
}

export async function getChapterProgress(
  bookId: number,
): Promise<{ done: number; total: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ done: number | null; total: number }>(
    `SELECT COUNT(*) AS total, SUM(gen_status = 'done') AS done
     FROM chapters WHERE book_id = ?`,
    [bookId],
  );
  return { done: row?.done ?? 0, total: row?.total ?? 0 };
}
