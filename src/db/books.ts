import { nowIso } from '../lib/dates';
import type { Book, BookSource, BookStatus } from '../types';
import { getDb, write } from './index';
import { buildSet } from './sql';

interface BookRow {
  id: number;
  title: string;
  author: string | null;
  source: BookSource;
  file_uri: string | null;
  status: BookStatus;
  plan_days: number | null;
  created_at: string;
}

type BookPatch = Partial<
  Pick<Book, 'title' | 'author' | 'source' | 'fileUri' | 'status' | 'planDays'>
>;

const PATCH_COLUMNS: { [K in keyof BookPatch]-?: string } = {
  title: 'title',
  author: 'author',
  source: 'source',
  fileUri: 'file_uri',
  status: 'status',
  planDays: 'plan_days',
};

function toBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    source: row.source,
    fileUri: row.file_uri,
    status: row.status,
    planDays: row.plan_days,
    createdAt: row.created_at,
  };
}

export async function createBook(input: {
  title: string;
  author?: string | null;
  source: BookSource;
  fileUri?: string | null;
}): Promise<Book> {
  const createdAt = nowIso();
  const result = await write(
    'INSERT INTO books (title, author, source, file_uri, created_at) VALUES (?, ?, ?, ?, ?)',
    [input.title, input.author ?? null, input.source, input.fileUri ?? null, createdAt],
  );
  return {
    id: result.lastInsertRowId,
    title: input.title,
    author: input.author ?? null,
    source: input.source,
    fileUri: input.fileUri ?? null,
    status: 'draft',
    planDays: null,
    createdAt,
  };
}

export async function getBook(id: number): Promise<Book | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE id = ?', [id]);
  return row ? toBook(row) : null;
}

export async function listBooks(): Promise<Book[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<BookRow>(
    'SELECT * FROM books ORDER BY created_at DESC, id DESC',
    [],
  );
  return rows.map(toBook);
}

export async function updateBook(id: number, patch: BookPatch): Promise<void> {
  const set = buildSet(patch, PATCH_COLUMNS);
  if (!set) return;
  await write(`UPDATE books SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

// Chapters, cards, tasks and chat messages go with it (ON DELETE CASCADE).
export async function deleteBook(id: number): Promise<void> {
  await write('DELETE FROM books WHERE id = ?', [id]);
}
