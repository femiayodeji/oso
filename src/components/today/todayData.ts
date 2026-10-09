import { getStreak } from '../../db/activity';
import { getBook, listBooks } from '../../db/books';
import { listCardsForBook, listDueReviewCards } from '../../db/cards';
import { getChapterProgress } from '../../db/chapters';
import { getTask, listNextTasks, listTasks, type TaskWithBook } from '../../db/tasks';
import { todayLocal } from '../../lib/dates';
import { hasApiKey } from '../../llm/apiKey';
import type { Book, StreakInfo } from '../../types';

export interface ActiveTask {
  id: number;
  bookId: number;
  title: string;
  bookTitle: string;
}

export const REVIEW_LABEL = 'Review due cards';

export interface TodayData {
  hasKey: boolean;
  books: Book[];
  nextTasks: TaskWithBook[];
  streak: StreakInfo;
  // Chapter progress of the first book still being prepared, if any.
  preparing: { book: Book; done: number; total: number } | null;
  // Whether any recall card from a completed task is due today.
  hasDueReviews: boolean;
}

export interface Recap {
  bookTitle: string;
  tasks: number;
  cards: number;
}

export async function loadToday(): Promise<TodayData> {
  const [hasKey, books, nextTasks, streak, due] = await Promise.all([
    hasApiKey(),
    listBooks(),
    listNextTasks(),
    getStreak(),
    listDueReviewCards(todayLocal(), { limit: 1 }),
  ]);
  const pending = books.find((b) => b.status === 'generating' || b.status === 'draft');
  const preparing = pending ? { book: pending, ...(await getChapterProgress(pending.id)) } : null;
  return { hasKey, books, nextTasks, streak, preparing, hasDueReviews: due.length > 0 };
}

// A task opened from the book screen. Completed or missing tasks are ignored.
export async function loadTaskById(taskId: number): Promise<ActiveTask | null> {
  const task = await getTask(taskId);
  if (!task || task.completedAt) return null;
  const book = await getBook(task.bookId);
  if (!book) return null;
  return { id: task.id, bookId: task.bookId, title: task.title, bookTitle: book.title };
}

export async function loadRecap(bookId: number, bookTitle: string): Promise<Recap> {
  const [tasks, cards] = await Promise.all([listTasks(bookId), listCardsForBook(bookId)]);
  return { bookTitle, tasks: tasks.length, cards: cards.length };
}
