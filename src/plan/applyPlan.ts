import { replacePlanTasks } from '../db/plan';
import { planRemaining, planWithinTotal } from './splitPlan';

type Applied = { taskCount: number; completedCount: number };

// `days` is the number of days REMAINING, counted from now. Completed tasks and their
// cards are never touched; everything else is re-split over `days` tasks and plan_days
// becomes completed + days. `taskCount` is the book's total (completed + new).
export function applyPlan(bookId: number, days: number): Promise<Applied> {
  return replacePlanTasks(bookId, (cards, completedCount) => planRemaining(cards, completedCount, days));
}

// Places newly generated cards into a plan whose total length (plan_days) is already set.
export function reapplyPlan(bookId: number, totalDays: number): Promise<Applied> {
  return replacePlanTasks(bookId, (cards, completedCount) => planWithinTotal(cards, completedCount, totalDays));
}
