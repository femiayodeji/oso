import type { SQLiteBindValue } from 'expo-sqlite';

// SQLite's default limit on bound parameters is 999 on older builds; stay well under it.
export const MAX_IN_PARAMS = 500;

export interface SetClause {
  sql: string;
  params: SQLiteBindValue[];
}

// Builds "col = ?, col2 = ?" from a camelCase patch. Keys set to undefined are skipped;
// null is written as NULL. Returns null when there is nothing to update.
export function buildSet<T extends object>(
  patch: T,
  columns: { [K in keyof T]-?: string },
): SetClause | null {
  const parts: string[] = [];
  const params: SQLiteBindValue[] = [];
  for (const key of Object.keys(columns) as (keyof T)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    parts.push(`${columns[key]} = ?`);
    params.push(value as SQLiteBindValue);
  }
  return parts.length > 0 ? { sql: parts.join(', '), params } : null;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
