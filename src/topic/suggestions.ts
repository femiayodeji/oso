// Ideas shown where a blank "what do you want to learn?" would otherwise sit.
export const SUGGESTIONS = [
  'Stoicism',
  'How memory works',
  'Game theory',
  'Atomic Habits by James Clear',
  'How the internet works',
  'Personal finance basics',
  'The history of Rome',
  'Negotiation',
  'How vaccines work',
  'Behavioral economics',
  'Thinking, Fast and Slow',
  'Music theory',
  'Black holes',
  'Sleep science',
  'Public speaking',
  'Machine learning basics',
  'The French Revolution',
  'Nutrition myths',
  'Sapiens by Yuval Noah Harari',
  'How to read a balance sheet',
];

// `seed` picks a different but stable handful, e.g. the day of the year.
export function pickSuggestions(count: number, seed: number): string[] {
  const n = SUGGESTIONS.length;
  const start = ((Math.floor(seed) % n) + n) % n;
  return Array.from({ length: Math.min(count, n) }, (_, i) => SUGGESTIONS[(start + i * 7) % n]);
}
