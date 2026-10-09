export type PlanCard = { id: number; chapterIdx: number; chapterTitle: string };

export type PlannedTask = { title: string; cardIds: number[] };

function titleFor(cards: PlanCard[]): string {
  const first = cards[0];
  const last = cards[cards.length - 1];
  if (first.chapterIdx === last.chapterIdx) return first.chapterTitle;
  return `${first.chapterTitle} to ${last.chapterTitle}`;
}

// Splits cards (already in reading order) into contiguous, balanced tasks.
// Sizes differ by at most one card; earlier tasks take the extra cards.
export function splitIntoTasks(cards: PlanCard[], days: number): PlannedTask[] {
  if (cards.length === 0) return [];
  const wanted = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 1;
  const count = Math.min(wanted, cards.length);
  const base = Math.floor(cards.length / count);
  const extra = cards.length % count;

  const tasks: PlannedTask[] = [];
  let start = 0;
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0);
    const slice = cards.slice(start, start + size);
    tasks.push({ title: titleFor(slice), cardIds: slice.map((c) => c.id) });
    start += size;
  }
  return tasks;
}
