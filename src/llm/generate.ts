import type { NewCard } from '../db/cards';
import type { Topic, Card, Unit } from '../types';
import { readSourceText } from './sourceText';
import { completeJson } from './client';
import { LlmError } from './errors';
import { cardRewritePrompt, unitPrompt, outlinePrompt } from './prompts';
import { toTopicIcon, type TopicIcon } from '../topic/icons';
import {
  outlineSchema,
  rewrittenCardSchema,
  rewrittenQuizSchema,
  unitContentSchema,
  type GeneratedCard,
} from './schemas';
import { buildUploadedOutline, condenseText } from './textSplit';

// About 15k tokens of source per call: fits every current model with room for the reply.
export const MAX_UNIT_CHARS = 60_000;

export class GenerationError extends Error {}

export type OutlineUnit = { idx: number; title: string; sourceText: string | null };

// What the model tells us about the topic itself: a tidy title, a book's author, an icon.
export type TopicMeta = { title: string | null; author: string | null; icon: TopicIcon | null };

export type BuiltOutline = { units: OutlineUnit[]; meta: TopicMeta | null };

async function outlineFromFile(topic: Topic): Promise<BuiltOutline> {
  if (!topic.fileUri) throw new GenerationError('The topic file is missing. Attach it again and retry.');
  let text: string;
  try {
    text = await readSourceText(topic.fileUri);
  } catch (e) {
    throw new GenerationError(e instanceof Error ? e.message : 'The topic file could not be read.');
  }
  const units = buildUploadedOutline(text, MAX_UNIT_CHARS);
  if (units.length === 0) throw new GenerationError('No readable text was found in this file.');
  return { units: units.map((c, idx) => ({ idx, title: c.title, sourceText: c.text })), meta: null };
}

async function outlineFromKnowledge(topic: Topic): Promise<BuiltOutline> {
  const outline = await completeJson(outlinePrompt(topic), outlineSchema);
  if (outline.known === false || outline.units.length === 0) {
    throw new GenerationError(
      'The model could not build a course for this. Try wording it more specifically, or add your own material.',
    );
  }
  return {
    units: outline.units.map((c, idx) => ({ idx, title: c.title, sourceText: null })),
    meta: {
      title: outline.title || null,
      author: outline.kind === 'book' ? outline.author || null : null,
      icon: toTopicIcon(outline.icon),
    },
  };
}

export function buildOutline(topic: Topic): Promise<BuiltOutline> {
  return topic.source === 'uploaded' ? outlineFromFile(topic) : outlineFromKnowledge(topic);
}

// Reading order: the unit overview first, everything else as the model ordered it.
export function toNewCards(cards: GeneratedCard[]): NewCard[] {
  const summaries = cards.filter((c) => c.type === 'summary');
  const rest = cards.filter((c) => c.type !== 'summary');
  return [...summaries, ...rest].map((card, idx) => ({
    idx,
    type: card.type,
    front: card.front,
    back: card.type === 'recall' || card.type === 'quiz' ? (card.back ?? null) : null,
    options: card.type === 'quiz' ? (card.options ?? null) : null,
    answerIdx: card.type === 'quiz' ? (card.answer ?? null) : null,
  }));
}

export async function generateUnitContent(
  topic: Topic,
  unit: Unit,
  outline: Pick<Unit, 'idx' | 'title'>[],
  cardCount: number | null,
): Promise<{ summary: string; cards: NewCard[] }> {
  let source = unit.sourceText;
  for (let attempt = 0; ; attempt++) {
    try {
      // Units of a topic share the system prompt, so cache it: the next unit (and any JSON
      // retry) reads it instead of paying for it again.
      const content = await completeJson(
        { ...unitPrompt({ topic, unit: { ...unit, sourceText: source }, outline, cardCount }), cache: 'system' },
        unitContentSchema,
      );
      return { summary: content.summary, cards: toNewCards(content.cards) };
    } catch (e) {
      // Some providers accept far less than MAX_UNIT_CHARS per request. Halve the
      // unit text and try again rather than failing the whole topic on one unit.
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
  topic: Topic,
  unit: Unit,
  card: Card,
  note?: string,
): Promise<{ front: string; back: string | null; options: string[] | null; answerIdx: number | null }> {
  const prompt = cardRewritePrompt({ topic, unit, card, note });
  if (card.type === 'quiz') {
    const quiz = await completeJson(prompt, rewrittenQuizSchema);
    return { front: quiz.front, back: quiz.back || null, options: quiz.options ?? null, answerIdx: quiz.answer ?? null };
  }
  const rewritten = await completeJson(prompt, rewrittenCardSchema);
  const back = card.type === 'recall' ? (rewritten.back || card.back) : null;
  return { front: rewritten.front, back, options: null, answerIdx: null };
}
