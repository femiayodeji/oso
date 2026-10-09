import { getBook, listBooks, updateBook } from '../db/books';
import { getCard, replaceCardsForChapter, updateCardContent } from '../db/cards';
import { deleteChaptersForBook, getChapter, insertChapters, listChapters, updateChapter } from '../db/chapters';
import { applyPlan } from '../plan/applyPlan';
import type { Book, Chapter } from '../types';
import { hasApiKey } from './apiKey';
import { importBookFile } from './bookText';
import { describeLlmError, LlmError } from './errors';
import { buildOutline, generateChapterContent, GenerationError, rewriteCard } from './generate';

type Listener = (bookId: number) => void;

// In-memory only: guards against double runs and holds the last failure reason per book.
const running = new Set<number>();
const listeners = new Set<Listener>();
const lastErrors = new Map<number, string>();

// Failures where trying the next chapter would only fail the same way.
const STOP_KINDS: LlmError['kind'][] = ['no_key', 'invalid_key', 'network', 'rate_limit'];

export function subscribeGeneration(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(bookId: number): void {
  listeners.forEach((listener) => {
    try {
      listener(bookId);
    } catch {
      // A broken listener must not stop generation.
    }
  });
}

export function isGenerating(bookId: number): boolean {
  return running.has(bookId);
}

// Short, user-facing reason for the last failed run of this book, if any.
export function getGenerationError(bookId: number): string | null {
  return lastErrors.get(bookId) ?? null;
}

function describe(e: unknown): string {
  return e instanceof GenerationError ? e.message : describeLlmError(e);
}

async function ensureOutline(book: Book): Promise<Chapter[]> {
  const existing = await listChapters(book.id);
  if (existing.length > 0) return existing;
  await insertChapters(book.id, await buildOutline(book));
  notify(book.id);
  return listChapters(book.id);
}

async function generateChapters(book: Book, chapters: Chapter[]): Promise<void> {
  for (const chapter of chapters) {
    if (chapter.genStatus === 'done') continue;
    try {
      const content = await generateChapterContent(book, chapter, chapters);
      await replaceCardsForChapter(book.id, chapter.id, content.cards);
      await updateChapter(chapter.id, { summary: content.summary, genStatus: 'done' });
    } catch (e) {
      lastErrors.set(book.id, describe(e));
      await updateChapter(chapter.id, { genStatus: 'failed' });
      if (e instanceof LlmError && STOP_KINDS.includes(e.kind)) return;
    } finally {
      notify(book.id);
    }
  }
}

async function generate(bookId: number): Promise<void> {
  const book = await getBook(bookId);
  if (!book) return;
  const before = await listChapters(bookId);
  const complete = before.length > 0 && before.every((c) => c.genStatus === 'done');
  if (complete && (book.status === 'ready' || book.status === 'finished')) return;

  lastErrors.delete(bookId);
  await updateBook(bookId, { status: 'generating' });
  notify(bookId);

  const chapters = await ensureOutline(book);
  await generateChapters(book, chapters);

  const after = await listChapters(bookId);
  if (after.length === 0 || after.some((c) => c.genStatus !== 'done')) {
    await updateBook(bookId, { status: 'failed' });
    return;
  }
  lastErrors.delete(bookId);
  // A book that already has a plan gets its new cards placed into tasks. Without a
  // plan the cards stay unassigned until the chat sets one.
  if (book.planDays !== null) await applyPlan(bookId, book.planDays);
  await updateBook(bookId, { status: 'ready' });
}

export async function runGeneration(bookId: number): Promise<void> {
  if (running.has(bookId)) return;
  running.add(bookId);
  try {
    if (!(await hasApiKey())) throw new LlmError('no_key');
    try {
      await generate(bookId);
    } catch (e) {
      lastErrors.set(bookId, describe(e));
      await updateBook(bookId, { status: 'failed' }).catch(() => undefined);
    }
  } finally {
    running.delete(bookId);
    notify(bookId);
  }
}

export async function resumePendingGenerations(): Promise<void> {
  try {
    if (!(await hasApiKey())) return;
    const stuck = (await listBooks()).filter((b) => b.status === 'generating');
    for (const book of stuck) {
      await runGeneration(book.id).catch(() => undefined);
    }
  } catch {
    // Resuming is best effort; the book screen offers Retry.
  }
}

export async function regenerateCard(cardId: number, note?: string): Promise<void> {
  const card = await getCard(cardId);
  if (!card) return;
  const [book, chapter] = await Promise.all([getBook(card.bookId), getChapter(card.chapterId)]);
  if (!book || !chapter) return;
  const rewritten = await rewriteCard(book, chapter, card, note);
  await updateCardContent(cardId, { type: card.type, front: rewritten.front, back: rewritten.back });
  notify(book.id);
}

function fileNameFromUri(uri: string): string {
  return decodeURIComponent(uri.split(/[?#]/)[0].split('/').pop() ?? '') || 'book.txt';
}

export async function regenerateBook(bookId: number, opts?: { fileUri?: string; fileName?: string }): Promise<void> {
  if (running.has(bookId)) return;
  if (!(await hasApiKey())) throw new LlmError('no_key');
  const book = await getBook(bookId);
  if (!book) return;

  if (opts?.fileUri) {
    const fileUri = await importBookFile(opts.fileUri, opts.fileName ?? fileNameFromUri(opts.fileUri));
    await updateBook(bookId, { source: 'uploaded', fileUri });
  }
  await deleteChaptersForBook(bookId);
  await updateBook(bookId, { status: 'generating' });
  notify(bookId);
  await runGeneration(bookId);
}
