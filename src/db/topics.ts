import { nowIso } from '../lib/dates';
import { toDepth, type Depth } from '../topic/depth';
import { toTopicIcon } from '../topic/icons';
import type { Topic, TopicSource, TopicStatus } from '../types';
import { getDb, write } from './index';
import { buildSet } from './sql';

interface TopicRow {
  id: number;
  title: string;
  author: string | null;
  source: TopicSource;
  file_uri: string | null;
  status: TopicStatus;
  plan_days: number | null;
  icon: string | null;
  depth: string | null;
  created_at: string;
}

type TopicPatch = Partial<
  Pick<Topic, 'title' | 'author' | 'source' | 'fileUri' | 'status' | 'planDays' | 'icon' | 'depth'>
>;

const PATCH_COLUMNS: { [K in keyof TopicPatch]-?: string } = {
  title: 'title',
  author: 'author',
  source: 'source',
  fileUri: 'file_uri',
  status: 'status',
  planDays: 'plan_days',
  icon: 'icon',
  depth: 'depth',
};

function toTopic(row: TopicRow): Topic {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    source: row.source,
    fileUri: row.file_uri,
    status: row.status,
    planDays: row.plan_days,
    icon: toTopicIcon(row.icon),
    depth: toDepth(row.depth),
    createdAt: row.created_at,
  };
}

export async function createTopic(input: {
  title: string;
  author?: string | null;
  source: TopicSource;
  fileUri?: string | null;
  planDays?: number | null;
  depth?: Depth | null;
}): Promise<Topic> {
  const createdAt = nowIso();
  const result = await write(
    'INSERT INTO topics (title, author, source, file_uri, plan_days, depth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      input.title,
      input.author ?? null,
      input.source,
      input.fileUri ?? null,
      input.planDays ?? null,
      input.depth ?? null,
      createdAt,
    ],
  );
  return {
    id: result.lastInsertRowId,
    title: input.title,
    author: input.author ?? null,
    source: input.source,
    fileUri: input.fileUri ?? null,
    status: 'draft',
    planDays: input.planDays ?? null,
    icon: null,
    depth: input.depth ?? null,
    createdAt,
  };
}

export async function getTopic(id: number): Promise<Topic | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TopicRow>('SELECT * FROM topics WHERE id = ?', [id]);
  return row ? toTopic(row) : null;
}

// When a topic's latest session was completed; null if none was. Sorting DESC puts null last
// (SQLite treats null as smallest). Review never completes a session, so it never reorders.
export function lastStudied(topicAlias: string): string {
  return `(SELECT MAX(s.completed_at) FROM sessions s WHERE s.topic_id = ${topicAlias}.id)`;
}

// Most recently studied first, then newest created.
export async function listTopics(): Promise<Topic[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TopicRow>(
    `SELECT * FROM topics t ORDER BY ${lastStudied('t')} DESC, t.created_at DESC, t.id DESC`,
    [],
  );
  return rows.map(toTopic);
}

export async function updateTopic(id: number, patch: TopicPatch): Promise<void> {
  const set = buildSet(patch, PATCH_COLUMNS);
  if (!set) return;
  await write(`UPDATE topics SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

// Units, cards, sessions and chat messages go with it (ON DELETE CASCADE).
export async function deleteTopic(id: number): Promise<void> {
  await write('DELETE FROM topics WHERE id = ?', [id]);
}
