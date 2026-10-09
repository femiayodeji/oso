import { openDatabaseAsync, type SQLiteBindParams, type SQLiteDatabase, type SQLiteRunResult } from 'expo-sqlite';

import { MIGRATIONS } from './schema';

const DB_NAME = 'oso.db';

let dbPromise: Promise<SQLiteDatabase> | null = null;

async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

async function open(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DB_NAME);
  try {
    await db.execAsync('PRAGMA journal_mode = WAL');
    // Must run outside a transaction: SQLite ignores it inside one.
    await db.execAsync('PRAGMA foreign_keys = ON');
    await migrate(db);
    return db;
  } catch (e) {
    await db.closeAsync().catch(() => undefined);
    throw e;
  }
}

// Concurrent first calls share one open + migrate promise. A failed open is not cached.
export function getDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((e: unknown) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

export async function initDb(): Promise<void> {
  await getDb();
}

let txQueue: Promise<unknown> = Promise.resolve();

// Runs `task` in one transaction on the shared connection. expo-sqlite's
// withTransactionAsync is not exclusive, so transactions are queued here to keep two of
// them from interleaving. Do not call withTransaction from inside a task (it would wait
// on itself); pass the `db` handle down instead.
export function withTransaction<T>(task: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
  const run = txQueue.then(async () => {
    const db = await getDb();
    let result: T | undefined;
    await db.withTransactionAsync(async () => {
      result = await task(db);
    });
    return result as T;
  });
  txQueue = run.catch(() => undefined);
  return run;
}

// A single write outside a transaction. It goes through the same queue so it can never
// land inside (and be rolled back with) another flow's open transaction.
export function write(sql: string, params: SQLiteBindParams = []): Promise<SQLiteRunResult> {
  const run = txQueue.then(async () => (await getDb()).runAsync(sql, params));
  txQueue = run.catch(() => undefined);
  return run;
}
