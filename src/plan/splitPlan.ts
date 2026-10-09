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
  const count = Math.min(wholeDays(days), cards.length);
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

export type Plan = { planDays: number; tasks: PlannedTask[] };

export function wholeDays(days: number): number {
  return Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 1;
}

// "Finish in N days" counts from now: the cards not yet in a completed task are spread
// over `daysRemaining` tasks, and the book's plan is the days already done plus those.
export function planRemaining(cards: PlanCard[], completedCount: number, daysRemaining: number): Plan {
  const days = wholeDays(daysRemaining);
  return { planDays: completedCount + days, tasks: splitIntoTasks(cards, days) };
}

// Re-fits the remaining cards into a plan whose total length is already decided.
export function planWithinTotal(cards: PlanCard[], completedCount: number, totalDays: number): Plan {
  return planRemaining(cards, completedCount, wholeDays(totalDays) - completedCount);
}
