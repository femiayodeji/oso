import { getBook, listBooks, updateBook } from '../db/books';
import { getCard, replaceCardsForChapter, updateCardContent } from '../db/cards';
import {
  getChapter,
  insertChapters,
  listChapterHeads,
  replaceChaptersForBook,
  updateChapter,
  type ChapterHead,
} from '../db/chapters';
import { clearChat } from '../db/chat';
import { reapplyPlan } from '../plan/applyPlan';
import type { Book, BookSource } from '../types';
import { hasApiKey } from './apiKey';
import { deleteBookFile, importBookFile } from './bookText';
import { describeLlmError, LlmError } from './errors';
import { buildOutline, generateChapterContent, GenerationError, rewriteCard, type OutlineChapter } from './generate';

type Listener = (bookId: number) => void;

// In-memory only: guards against double runs and holds the last failure reason per book.
const running = new Set<number>();
const listeners = new Set<Listener>();
const lastErrors = new Map<number, string>();

// Failures where trying the next chapter would only fail the same way.
const STOP_KINDS: LlmError['kind'][] = ['no_key', 'invalid_key', 'network', 'rate_limit', 'bad_request', 'timeout'];

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

// True while a generation or regenerate of this book is running in this process. A book
// whose status is 'generating' while this is false was interrupted and needs a Retry.
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

async function ensureOutline(book: Book): Promise<ChapterHead[]> {
  const existing = await listChapterHeads(book.id);
  if (existing.length > 0) return existing;
  await insertChapters(book.id, await buildOutline(book));
  notify(book.id);
  return listChapterHeads(book.id);
}

// Source text is loaded one chapter at a time, never the whole book at once.
async function generateChapters(book: Book, heads: ChapterHead[]): Promise<void> {
  for (const head of heads) {
    if (head.genStatus === 'done') continue;
    // The book may have been deleted while the previous chapter was generating.
    if (!(await getBook(book.id))) return;
    try {
      const chapter = await getChapter(head.id);
      if (!chapter) continue;
      const content = await generateChapterContent(book, chapter, heads);
      await replaceCardsForChapter(book.id, chapter.id, content.cards);
      await updateChapter(chapter.id, { summary: content.summary, genStatus: 'done' });
    } catch (e) {
      lastErrors.set(book.id, describe(e));
      await updateChapter(head.id, { genStatus: 'failed' });
      if (e instanceof LlmError && STOP_KINDS.includes(e.kind)) return;
    } finally {
      notify(book.id);
    }
  }
}

async function generate(bookId: number): Promise<void> {
  const book = await getBook(bookId);
  if (!book) return;
  const before = await listChapterHeads(bookId);
  const complete = before.length > 0 && before.every((c) => c.genStatus === 'done');
  if (complete && (book.status === 'ready' || book.status === 'finished')) return;

  lastErrors.delete(bookId);
  await updateBook(bookId, { status: 'generating' });
  notify(bookId);

  const chapters = await ensureOutline(book);
  await generateChapters(book, chapters);

  if (!(await getBook(bookId))) {
    lastErrors.delete(bookId);
    return;
  }
  const after = await listChapterHeads(bookId);
  if (after.length === 0 || after.some((c) => c.genStatus !== 'done')) {
    await updateBook(bookId, { status: 'failed' });
    return;
  }
  lastErrors.delete(bookId);
  // A book that already has a plan gets its new cards placed into tasks, keeping the
  // plan's total length. Without a plan the cards stay unassigned until the chat sets one.
  if (book.planDays !== null) await reapplyPlan(bookId, book.planDays);
  await updateBook(bookId, { status: 'ready' });
}

async function generateOrFail(bookId: number): Promise<void> {
  try {
    await generate(bookId);
  } catch (e) {
    lastErrors.set(bookId, describe(e));
    await updateBook(bookId, { status: 'failed' }).catch(() => undefined);
  }
}

export async function runGeneration(bookId: number): Promise<void> {
  if (running.has(bookId)) return;
  running.add(bookId);
  try {
    if (!(await hasApiKey())) throw new LlmError('no_key');
    await generateOrFail(bookId);
  } finally {
    running.delete(bookId);
    notify(bookId);
  }
}

async function resumeAll(): Promise<void> {
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

let resuming: Promise<void> | null = null;

// Called on every app foreground. One pass at a time: a call made while a pass is still
// working through the books joins it instead of starting a second, parallel one.
export function resumePendingGenerations(): Promise<void> {
  resuming ??= resumeAll().finally(() => {
    resuming = null;
  });
  return resuming;
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

type RegenerateOptions = { fileUri?: string; fileName?: string };
type Replacement = { source: BookSource; fileUri: string | null; outline: OutlineChapter[] };

// Everything a regenerate needs before it may delete anything: the new file (if one was
// picked) and a validated outline. Throws without touching the book's rows.
async function prepareReplacement(book: Book, opts?: RegenerateOptions): Promise<Replacement> {
  if (!opts?.fileUri) return { source: book.source, fileUri: book.fileUri, outline: await buildOutline(book) };
  const fileUri = await importBookFile(opts.fileUri, opts.fileName ?? fileNameFromUri(opts.fileUri));
  try {
    const outline = await buildOutline({ ...book, source: 'uploaded', fileUri });
    return { source: 'uploaded', fileUri, outline };
  } catch (e) {
    if (fileUri !== book.fileUri) deleteBookFile(fileUri);
    throw e;
  }
}

// Rejects, leaving the book exactly as it was, when the new outline cannot be obtained
// (no key, offline, unreadable file). Once the old content is replaced, later failures
// mark the book 'failed' like any other generation.
export async function regenerateBook(bookId: number, opts?: RegenerateOptions): Promise<void> {
  if (running.has(bookId)) return;
  running.add(bookId);
  try {
    if (!(await hasApiKey())) throw new LlmError('no_key');
    const book = await getBook(bookId);
    if (!book) return;
    notify(bookId);

    const next = await prepareReplacement(book, opts);
    await replaceChaptersForBook(bookId, next.outline);
    await updateBook(bookId, { source: next.source, fileUri: next.fileUri, status: 'generating' });
    // The old conversation was about content that no longer exists.
    await clearChat(bookId);
    if (book.fileUri !== next.fileUri) deleteBookFile(book.fileUri);
    lastErrors.delete(bookId);
    notify(bookId);

    await generateOrFail(bookId);
  } finally {
    running.delete(bookId);
    notify(bookId);
  }
}
