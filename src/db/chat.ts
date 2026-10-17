import { nowIso } from '../lib/dates';
import type { ChatMessage, ChatRole } from '../types';
import { getDb, write } from './index';

interface ChatRow {
  id: number;
  topic_id: number | null;
  role: ChatRole;
  content: string;
  created_at: string;
}

const DEFAULT_LIMIT = 50;

function toMessage(row: ChatRow): ChatMessage {
  return {
    id: row.id,
    topicId: row.topic_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function addChatMessage(
  topicId: number | null,
  role: ChatRole,
  content: string,
): Promise<ChatMessage> {
  const createdAt = nowIso();
  const result = await write(
    'INSERT INTO chat_messages (topic_id, role, content, created_at) VALUES (?, ?, ?, ?)',
    [topicId, role, content, createdAt],
  );
  return { id: result.lastInsertRowId, topicId, role, content, createdAt };
}

// `topic_id IS ?` matches both a real id and NULL (the topic-less thread).
export async function listChatMessages(
  topicId: number | null,
  limit: number = DEFAULT_LIMIT,
): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ChatRow>(
    `SELECT * FROM (
       SELECT * FROM chat_messages WHERE topic_id IS ? ORDER BY id DESC LIMIT ?
     ) ORDER BY id ASC`,
    [topicId, Math.max(0, Math.floor(limit))],
  );
  return rows.map(toMessage);
}

export async function countChatMessages(topicId: number | null): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM chat_messages WHERE topic_id IS ?', [
    topicId,
  ]);
  return row?.n ?? 0;
}

export async function clearChat(topicId: number | null): Promise<void> {
  await write('DELETE FROM chat_messages WHERE topic_id IS ?', [topicId]);
}
