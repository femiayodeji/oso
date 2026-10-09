import { diffDays, isDateString } from '../lib/dates';
import type { StreakInfo } from '../types';

// Two active days belong to the same chain when at most one full day lies between them.
const MAX_GAP = 2;

function uniqueSortedDesc(dates: string[]): string[] {
  return [...new Set(dates.filter(isDateString))].sort().reverse();
}

// Grace rule: one missed day neither adds to the count nor breaks the chain; two
// consecutive full days with no activity reset it. Today is still in progress, so an
// empty today is never counted as a missed day: only the days strictly between the
// last active day and today are. Dates after `today` are ignored.
export function computeStreak(activeDates: string[], today: string): StreakInfo {
  const dates = uniqueSortedDesc(activeDates).filter((d) => d <= today);
  if (dates.length === 0) return { current: 0, doneToday: false, atRisk: false };

  const sinceLast = diffDays(dates[0], today);
  const doneToday = sinceLast === 0;
  if (sinceLast > MAX_GAP) return { current: 0, doneToday, atRisk: false };

  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    if (diffDays(dates[i], dates[i - 1]) > MAX_GAP) break;
    current++;
  }

  // Yesterday was the grace day and today is still open. Only true for a live chain.
  return { current, doneToday, atRisk: sinceLast === MAX_GAP };
}

// Longest chain ever, under the same grace rule.
export function computeBestStreak(activeDates: string[]): number {
  const dates = uniqueSortedDesc(activeDates);
  let best = 0;
  let run = 0;
  for (let i = 0; i < dates.length; i++) {
    run = i > 0 && diffDays(dates[i], dates[i - 1]) <= MAX_GAP ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}
