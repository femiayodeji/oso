// Shared row and domain types. Mirrors the SQLite schema in CLAUDE.md.

import type { Depth } from './topic/depth';
import type { TopicIcon } from './topic/icons';

export type TopicSource = 'model_knowledge' | 'uploaded';
export type TopicStatus = 'draft' | 'generating' | 'ready' | 'failed' | 'finished';
export type GenStatus = 'pending' | 'done' | 'failed';
export type CardType = 'summary' | 'key_idea' | 'recall' | 'quiz';
// Card types that test the learner and come back for spaced review.
export const TESTING_TYPES: CardType[] = ['recall', 'quiz'];
export type ChatRole = 'user' | 'assistant';

export interface Topic {
  id: number;
  title: string;
  author: string | null;
  source: TopicSource;
  fileUri: string | null;
  status: TopicStatus;
  planDays: number | null;
  icon: TopicIcon | null;
  depth: Depth | null;
  createdAt: string;
}

export interface Unit {
  id: number;
  topicId: number;
  idx: number;
  title: string;
  sourceText: string | null;
  summary: string | null;
  genStatus: GenStatus;
}

export interface Session {
  id: number;
  topicId: number;
  idx: number;
  title: string;
  completedAt: string | null;
}

export interface Card {
  id: number;
  topicId: number;
  unitId: number;
  sessionId: number | null;
  idx: number;
  type: CardType;
  front: string;
  back: string | null; // recall: the answer; quiz: why the right option is right
  options: string[] | null; // quiz only
  answerIdx: number | null; // quiz only: index into options
  flagged: boolean;
  box: number;
  dueDate: string | null;
}

export interface ChatMessage {
  id: number;
  topicId: number | null;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export type Provider = 'openrouter' | 'gemini' | 'groq' | 'anthropic' | 'openai';
export type ColorSchemeSetting = 'system' | 'light' | 'dark';
export type PaletteSetting = 'standard' | 'reading';

// Non-secret settings, stored as strings in the `settings` table.
// The API key is NOT here; it lives in SecureStore only.
export interface AppSettings {
  provider: Provider;
  baseUrl: string; // used by the OpenAI-compatible adapter
  model: string;
  reminderEvening: string; // 'HH:MM', 24h local
  reminderLate: string; // 'HH:MM', 24h local
  colorScheme: ColorSchemeSetting;
  palette: PaletteSetting;
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
