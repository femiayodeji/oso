import { addDays } from '../lib/dates';

// Leitner boxes 1..5. Box 0 means "not in review yet" (session not completed).
export const MAX_BOX = 5;
export const BOX_INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

export interface ReviewSchedule {
  box: number;
  dueDate: string;
}

function schedule(box: number, today: string): ReviewSchedule {
  return { box, dueDate: addDays(today, BOX_INTERVAL_DAYS[box]) };
}

// A card enters review when its session is completed.
export function initialReview(today: string): ReviewSchedule {
  return schedule(1, today);
}

// Remembered: up one box (capped). Forgotten: back to box 1.
export function nextReview(box: number, remembered: boolean, today: string): ReviewSchedule {
  const current = Math.min(MAX_BOX, Math.max(1, Math.floor(box) || 1));
  return schedule(remembered ? Math.min(MAX_BOX, current + 1) : 1, today);
}
