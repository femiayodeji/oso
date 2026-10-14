import { replacePlanSessions } from '../db/plan';
import { planRemaining, planWithinTotal } from './splitPlan';

type Applied = { sessionCount: number; completedCount: number };

// `days` is the number of days REMAINING, counted from now. Completed sessions and their
// cards are never touched; everything else is re-split over `days` sessions and plan_days
// becomes completed + days. `sessionCount` is the topic's total (completed + new).
export function applyPlan(topicId: number, days: number): Promise<Applied> {
  return replacePlanSessions(topicId, (cards, completedCount) => planRemaining(cards, completedCount, days));
}

// Places newly generated cards into a plan whose total length (plan_days) is already set.
export function reapplyPlan(topicId: number, totalDays: number): Promise<Applied> {
  return replacePlanSessions(topicId, (cards, completedCount) => planWithinTotal(cards, completedCount, totalDays));
}
