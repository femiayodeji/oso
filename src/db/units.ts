import type { SQLiteDatabase } from 'expo-sqlite';

import type { Unit, GenStatus } from '../types';
import { getDb, withTransaction, write } from './index';
import { buildSet } from './sql';

interface UnitRow {
  id: number;
  topic_id: number;
  idx: number;
  title: string;
  source_text: string | null;
  summary: string | null;
  gen_status: GenStatus;
}

// A unit without its source text, which can be most of a topic for uploaded files.
export type UnitHead = Omit<Unit, 'sourceText'>;

type UnitHeadRow = Omit<UnitRow, 'source_text'>;

type NewUnit = { idx: number; title: string; sourceText?: string | null };

type UnitPatch = Partial<Pick<Unit, 'title' | 'sourceText' | 'summary' | 'genStatus'>>;

const PATCH_COLUMNS: { [K in keyof UnitPatch]-?: string } = {
  title: 'title',
  sourceText: 'source_text',
  summary: 'summary',
  genStatus: 'gen_status',
};

function toHead(row: UnitHeadRow): UnitHead {
  return {
    id: row.id,
    topicId: row.topic_id,
    idx: row.idx,
    title: row.title,
    summary: row.summary,
    genStatus: row.gen_status,
  };
}

function toUnit(row: UnitRow): Unit {
  return { ...toHead(row), sourceText: row.source_text };
}

async function insertRows(db: SQLiteDatabase, topicId: number, units: NewUnit[]): Promise<void> {
  for (const unit of units) {
    await db.runAsync(
      'INSERT INTO units (topic_id, idx, title, source_text) VALUES (?, ?, ?, ?)',
      [topicId, unit.idx, unit.title, unit.sourceText ?? null],
    );
  }
}

export async function insertUnits(topicId: number, units: NewUnit[]): Promise<void> {
  if (units.length === 0) return;
  await withTransaction((db) => insertRows(db, topicId, units));
}

// Everything about the topic's units except source_text. Use getUnit() for the one
// unit whose text is needed.
export async function listUnitHeads(topicId: number): Promise<UnitHead[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<UnitHeadRow>(
    'SELECT id, topic_id, idx, title, summary, gen_status FROM units WHERE topic_id = ? ORDER BY idx, id',
    [topicId],
  );
  return rows.map(toHead);
}

export async function getUnit(id: number): Promise<Unit | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<UnitRow>('SELECT * FROM units WHERE id = ?', [id]);
  return row ? toUnit(row) : null;
}

export async function updateUnit(id: number, patch: UnitPatch): Promise<void> {
  const set = buildSet(patch, PATCH_COLUMNS);
  if (!set) return;
  await write(`UPDATE units SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

// Content swap for a regenerate, in ONE transaction: the old units, cards and sessions
// go (a session is nothing but its cards) and the new outline takes their place, so the topic
// is never left without units. daily_activity is never touched.
export async function replaceUnitsForTopic(topicId: number, units: NewUnit[]): Promise<void> {
  await withTransaction(async (db) => {
    await db.runAsync('DELETE FROM units WHERE topic_id = ?', [topicId]);
    await db.runAsync('DELETE FROM cards WHERE topic_id = ?', [topicId]);
    await db.runAsync('DELETE FROM sessions WHERE topic_id = ?', [topicId]);
    await insertRows(db, topicId, units);
  });
}

export async function getUnitProgress(
  topicId: number,
): Promise<{ done: number; total: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ done: number | null; total: number }>(
    `SELECT COUNT(*) AS total, SUM(gen_status = 'done') AS done
     FROM units WHERE topic_id = ?`,
    [topicId],
  );
  return { done: row?.done ?? 0, total: row?.total ?? 0 };
}
