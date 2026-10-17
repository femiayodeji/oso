// How much a day of learning holds. A session is about 10 new cards (5 to 7 minutes):
// small enough for working memory and a daily habit, with spacing doing the rest.
// The plan length sets the card budget, and the budget sets units and cards per unit.

export const CARDS_PER_SESSION = 10;
export const MAX_CARDS_PER_SESSION = 12;
// Kept inside the unit schema's 3..24 cards.
export const MIN_CARDS_PER_UNIT = 3;
export const MAX_CARDS_PER_UNIT = 12;
// An open topic's units average about this many cards.
const CARDS_PER_TOPIC_UNIT = 8;
const MIN_TOPIC_UNITS = 3;
const MAX_TOPIC_UNITS = 40;

// The lengths offered when adding a topic.
export const PLAN_LENGTHS = [
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
];
export const DEFAULT_PLAN_DAYS = 7;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function whole(days: number): number {
  return Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 1;
}

export function cardBudget(days: number): number {
  return whole(days) * CARDS_PER_SESSION;
}

// How many units to ask for when the model designs the syllabus.
export function unitCountFor(days: number): number {
  return clamp(Math.round(cardBudget(days) / CARDS_PER_TOPIC_UNIT), MIN_TOPIC_UNITS, MAX_TOPIC_UNITS);
}

// Spreads the plan's budget over the units. `sourceChars` has one entry per unit, in order:
// with uploaded text a long chapter gets more cards; without it (null) the split is even.
export function cardsPerUnit(days: number, sourceChars: (number | null)[]): number[] {
  const weights = sourceChars.map((chars) => (chars === null ? 1 : Math.max(1, chars)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const budget = cardBudget(days);
  return weights.map((w) => clamp(Math.round((budget * w) / total), MIN_CARDS_PER_UNIT, MAX_CARDS_PER_UNIT));
}

// The fewest days that keep a fixed number of units (a book's chapters) at or under the
// daily maximum, even at the minimum cards per unit.
export function minDaysFor(unitCount: number): number {
  return Math.max(1, Math.ceil((unitCount * MIN_CARDS_PER_UNIT) / MAX_CARDS_PER_SESSION));
}

// The plan length to use once the outline is known: `days`, stretched when there are
// too many units to fit.
export function fitDays(days: number, unitCount: number): number {
  return Math.max(whole(days), minDaysFor(unitCount));
}

export function cardsPerDay(cardCount: number, days: number): number {
  return Math.round(cardCount / whole(days));
}

// True when `days` would put more than the daily maximum into each session.
export function isOverloaded(cardCount: number, days: number): boolean {
  return cardCount > whole(days) * MAX_CARDS_PER_SESSION;
}

export function suggestedDays(cardCount: number): number {
  return Math.max(1, Math.ceil(cardCount / CARDS_PER_SESSION));
}
