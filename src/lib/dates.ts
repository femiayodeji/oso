// Local calendar dates as 'YYYY-MM-DD' strings. Day arithmetic runs on the UTC
// calendar, so it never depends on the device timezone or on DST shifts.

const MS_PER_DAY = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function toUtcMs(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date string: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const ms = toUtcMs(value);
  return !Number.isNaN(ms) && fromUtcMs(ms) === value;
}

function fromUtcMs(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function toLocalDateString(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayLocal(): string {
  return toLocalDateString(new Date());
}

export function addDays(date: string, n: number): string {
  return fromUtcMs(toUtcMs(date) + n * MS_PER_DAY);
}

// Whole days from a to b (b - a).
export function diffDays(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / MS_PER_DAY);
}

// An instant (UTC ISO timestamp) for created_at / completed_at. Not a local date.
export function nowIso(): string {
  return new Date().toISOString();
}
