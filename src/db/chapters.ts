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

type ChapterPatch = Partial<Pick<Chapter, 'title' | 'sourceText' | 'summary' | 'genStatus'>>;

const PATCH_COLUMNS: { [K in keyof ChapterPatch]-?: string } = {
  title: 'title',
  sourceText: 'source_text',
  summary: 'summary',
  genStatus: 'gen_status',
};

function toChapter(row: ChapterRow): Chapter {
  return {
    id: row.id,
    bookId: row.book_id,
    idx: row.idx,
    title: row.title,
    sourceText: row.source_text,
    summary: row.summary,
    genStatus: row.gen_status,
  };
}

export async function insertChapters(
  bookId: number,
  chapters: { idx: number; title: string; sourceText?: string | null }[],
): Promise<void> {
  if (chapters.length === 0) return;
  await withTransaction(async (db) => {
    for (const chapter of chapters) {
      await db.runAsync(
        'INSERT INTO chapters (book_id, idx, title, source_text) VALUES (?, ?, ?, ?)',
        [bookId, chapter.idx, chapter.title, chapter.sourceText ?? null],
      );
    }
  });
}

export async function listChapters(bookId: number): Promise<Chapter[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ChapterRow>(
    'SELECT * FROM chapters WHERE book_id = ? ORDER BY idx, id',
    [bookId],
  );
  return rows.map(toChapter);
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

// Full content wipe for a regenerate: cards cascade from chapters, and the book's tasks
// go too because a task is nothing but its cards. daily_activity is never touched.
export async function deleteChaptersForBook(bookId: number): Promise<void> {
  await withTransaction(async (db) => {
    await db.runAsync('DELETE FROM chapters WHERE book_id = ?', [bookId]);
    await db.runAsync('DELETE FROM cards WHERE book_id = ?', [bookId]);
    await db.runAsync('DELETE FROM tasks WHERE book_id = ?', [bookId]);
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
