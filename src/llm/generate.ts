import type { NewCard } from '../db/cards';
import type { Book, Card, Chapter } from '../types';
import { readBookText } from './bookText';
import { completeJson } from './client';
import { LlmError } from './errors';
import { cardRewritePrompt, chapterPrompt, outlinePrompt } from './prompts';
import { chapterContentSchema, outlineSchema, rewrittenCardSchema, type GeneratedCard } from './schemas';
import { buildUploadedOutline, condenseText } from './textSplit';

// About 15k tokens of source per call: fits every current model with room for the reply.
export const MAX_CHAPTER_CHARS = 60_000;

export class GenerationError extends Error {}

export type OutlineChapter = { idx: number; title: string; sourceText: string | null };

async function outlineFromFile(book: Book): Promise<OutlineChapter[]> {
  if (!book.fileUri) throw new GenerationError('The book file is missing. Attach it again and retry.');
  let text: string;
  try {
    text = await readBookText(book.fileUri);
  } catch (e) {
    throw new GenerationError(e instanceof Error ? e.message : 'The book file could not be read.');
  }
  const chapters = buildUploadedOutline(text, MAX_CHAPTER_CHARS);
  if (chapters.length === 0) throw new GenerationError('No readable text was found in this file.');
  return chapters.map((c, idx) => ({ idx, title: c.title, sourceText: c.text }));
}

async function outlineFromKnowledge(book: Book): Promise<OutlineChapter[]> {
  const outline = await completeJson(outlinePrompt(book), outlineSchema);
  if (outline.known === false || outline.chapters.length === 0) {
    throw new GenerationError('The model does not know this book well enough. Try adding the book text instead.');
  }
  return outline.chapters.map((c, idx) => ({ idx, title: c.title, sourceText: null }));
}

export function buildOutline(book: Book): Promise<OutlineChapter[]> {
  return book.source === 'uploaded' ? outlineFromFile(book) : outlineFromKnowledge(book);
}

// Reading order: the chapter overview first, everything else as the model ordered it.
export function toNewCards(cards: GeneratedCard[]): NewCard[] {
  const summaries = cards.filter((c) => c.type === 'summary');
  const rest = cards.filter((c) => c.type !== 'summary');
  return [...summaries, ...rest].map((card, idx) => ({
    idx,
    type: card.type,
    front: card.front,
    back: card.type === 'recall' ? (card.back ?? null) : null,
  }));
}

export async function generateChapterContent(
  book: Book,
  chapter: Chapter,
  outline: Pick<Chapter, 'idx' | 'title'>[],
): Promise<{ summary: string; cards: NewCard[] }> {
  let source = chapter.sourceText;
  for (let attempt = 0; ; attempt++) {
    try {
      const content = await completeJson(
        chapterPrompt({ book, chapter: { ...chapter, sourceText: source }, outline }),
        chapterContentSchema,
      );
      return { summary: content.summary, cards: toNewCards(content.cards) };
    } catch (e) {
      // Some providers accept far less than MAX_CHAPTER_CHARS per request. Halve the
      // chapter text and try again rather than failing the whole book on one chapter.
      if (!isTooLarge(e) || !source || source.length < MIN_CONDENSED_CHARS || attempt >= MAX_CONDENSE_TRIES) throw e;
      source = condenseText(source, Math.floor(source.length / 2));
    }
  }
}

const MAX_CONDENSE_TRIES = 3;
const MIN_CONDENSED_CHARS = 4_000;

function isTooLarge(e: unknown): boolean {
  if (!(e instanceof LlmError) || e.kind !== 'bad_request') return false;
  return e.status === 413 || /too large|too long|context length|maximum context|too many tokens/i.test(e.message);
}

export async function rewriteCard(
  book: Book,
  chapter: Chapter,
  card: Card,
  note?: string,
): Promise<{ front: string; back: string | null }> {
  const rewritten = await completeJson(cardRewritePrompt({ book, chapter, card, note }), rewrittenCardSchema);
  const back = card.type === 'recall' ? (rewritten.back || card.back) : null;
  return { front: rewritten.front, back };
}
