import { nowIso } from '../lib/dates';
import type { ChatMessage, ChatRole } from '../types';
import { getDb, write } from './index';

interface ChatRow {
  id: number;
  book_id: number | null;
  role: ChatRole;
  content: string;
  created_at: string;
}

const DEFAULT_LIMIT = 50;

function toMessage(row: ChatRow): ChatMessage {
  return {
    id: row.id,
    bookId: row.book_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function addChatMessage(
  bookId: number | null,
  role: ChatRole,
  content: string,
): Promise<ChatMessage> {
  const createdAt = nowIso();
  const result = await write(
    'INSERT INTO chat_messages (book_id, role, content, created_at) VALUES (?, ?, ?, ?)',
    [bookId, role, content, createdAt],
  );
  return { id: result.lastInsertRowId, bookId, role, content, createdAt };
}

// `book_id IS ?` matches both a real id and NULL (the book-less thread).
export async function listChatMessages(
  bookId: number | null,
  limit: number = DEFAULT_LIMIT,
): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ChatRow>(
    `SELECT * FROM (
       SELECT * FROM chat_messages WHERE book_id IS ? ORDER BY id DESC LIMIT ?
     ) ORDER BY id ASC`,
    [bookId, Math.max(0, Math.floor(limit))],
  );
  return rows.map(toMessage);
}

export async function clearChat(bookId: number | null): Promise<void> {
  await write('DELETE FROM chat_messages WHERE book_id IS ?', [bookId]);
}
