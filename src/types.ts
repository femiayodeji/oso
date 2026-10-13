// Shared row and domain types. Mirrors the SQLite schema in CLAUDE.md.

export type BookSource = 'model_knowledge' | 'uploaded';
export type BookStatus = 'draft' | 'generating' | 'ready' | 'failed' | 'finished';
export type GenStatus = 'pending' | 'done' | 'failed';
export type CardType = 'summary' | 'key_idea' | 'recall';
export type ChatRole = 'user' | 'assistant';

export interface Book {
  id: number;
  title: string;
  author: string | null;
  source: BookSource;
  fileUri: string | null;
  status: BookStatus;
  planDays: number | null;
  createdAt: string;
}

export interface Chapter {
  id: number;
  bookId: number;
  idx: number;
  title: string;
  sourceText: string | null;
  summary: string | null;
  genStatus: GenStatus;
}

export interface Task {
  id: number;
  bookId: number;
  idx: number;
  title: string;
  completedAt: string | null;
}

export interface Card {
  id: number;
  bookId: number;
  chapterId: number;
  taskId: number | null;
  idx: number;
  type: CardType;
  front: string;
  back: string | null;
  flagged: boolean;
  box: number;
  dueDate: string | null;
}

export interface ChatMessage {
  id: number;
  bookId: number | null;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export type Provider = 'openrouter' | 'gemini' | 'groq' | 'anthropic' | 'openai';
export type ColorSchemeSetting = 'system' | 'light' | 'dark';

// Non-secret settings, stored as strings in the `settings` table.
// The API key is NOT here; it lives in SecureStore only.
export interface AppSettings {
  provider: Provider;
  baseUrl: string; // used by the OpenAI-compatible adapter
  model: string;
  reminderEvening: string; // 'HH:MM', 24h local
  reminderLate: string; // 'HH:MM', 24h local
  colorScheme: ColorSchemeSetting;
  soundsEnabled: boolean;
  bestStreak: number;
}

export interface StreakInfo {
  current: number;
  doneToday: boolean;
  // true when yesterday had no activity and today is not done yet:
  // one more missed day resets the streak.
  atRisk: boolean;
}
