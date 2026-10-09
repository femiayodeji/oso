import * as DocumentPicker from 'expo-document-picker';

import { getBook, listBooks } from '../../db/books';
import { getChapterProgress, listChapters } from '../../db/chapters';
import { listTasks } from '../../db/tasks';
import type { Book, BookStatus, Chapter, Task } from '../../types';

export interface BookSummary {
  book: Book;
  tasksDone: number;
  tasksTotal: number;
  chapters: { done: number; total: number };
}

export interface BookDetail extends BookSummary {
  chapterList: Chapter[];
  tasks: Task[];
}

async function summarize(book: Book): Promise<BookSummary & { tasks: Task[] }> {
  const [tasks, chapters] = await Promise.all([listTasks(book.id), getChapterProgress(book.id)]);
  return {
    book,
    tasks,
    chapters,
    tasksDone: tasks.filter((t) => t.completedAt).length,
    tasksTotal: tasks.length,
  };
}

export async function loadBooks(): Promise<BookSummary[]> {
  const books = await listBooks();
  return Promise.all(books.map(summarize));
}

export async function loadBookDetail(id: number): Promise<BookDetail | null> {
  const book = await getBook(id);
  if (!book) return null;
  const [summary, chapterList] = await Promise.all([summarize(book), listChapters(id)]);
  return { ...summary, chapterList };
}

export function statusLine({ book, tasksDone, tasksTotal, chapters }: BookSummary): string {
  const byStatus: Record<BookStatus, string> = {
    draft: 'Waiting to start',
    generating: chapters.total > 0 ? `Preparing chapters, ${chapters.done} of ${chapters.total}` : 'Preparing chapters…',
    failed: 'Preparation failed',
    finished: `Finished · ${tasksTotal} tasks`,
    ready: tasksTotal > 0 ? `${tasksDone} of ${tasksTotal} tasks done` : 'Ready · no plan yet',
  };
  return byStatus[book.status];
}

export interface PickedFile {
  uri: string;
  name: string;
}

const BOOK_FILE = /\.(pdf|epub|txt|md|markdown)$/i;

// Returns null when the user cancels. Throws a readable error for unsupported files.
export async function pickBookFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Markdown has no reliable MIME type on Android, so the extension is checked below.
    type: ['application/pdf', 'application/epub+zip', 'text/*', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (!BOOK_FILE.test(asset.name)) throw new Error('Pick a .pdf, .epub, .txt or .md file.');
  return { uri: asset.uri, name: asset.name };
}
