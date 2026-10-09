import { replacePlanTasks } from '../db/plan';
import { splitIntoTasks } from './splitPlan';

// Completed tasks and their cards are never touched. Everything else is re-split over
// the days that are left. `taskCount` is the book's total (completed + new).
export async function applyPlan(
  bookId: number,
  days: number,
): Promise<{ taskCount: number; completedCount: number }> {
  const planDays = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 1;
  return replacePlanTasks(bookId, planDays, (cards, completedCount) =>
    splitIntoTasks(cards, Math.max(1, planDays - completedCount)),
  );
}
