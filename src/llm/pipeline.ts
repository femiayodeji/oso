import { getTopic, listTopics, updateTopic } from '../db/topics';
import { getCard, replaceCardsForUnit, updateCardContent } from '../db/cards';
import {
  getUnit,
  insertUnits,
  listUnitHeads,
  listUnitSourceChars,
  replaceUnitsForTopic,
  updateUnit,
  type UnitHead,
} from '../db/units';
import { clearChat } from '../db/chat';
import { reapplyPlan } from '../plan/applyPlan';
import { cardsPerUnit, fitDays } from '../plan/budget';
import type { Topic, TopicSource } from '../types';
import { hasApiKey } from './apiKey';
import { deleteSourceFile, importSourceFile } from './sourceText';
import { describeLlmError, LlmError } from './errors';
import {
  buildOutline,
  generateUnitContent,
  GenerationError,
  rewriteCard,
  type OutlineUnit,
  type TopicMeta,
} from './generate';

type Listener = (topicId: number) => void;

// In-memory only: guards against double runs and holds the last failure reason per topic.
const running = new Set<number>();
const listeners = new Set<Listener>();
const lastErrors = new Map<number, string>();

// Failures where trying the next unit would only fail the same way.
const STOP_KINDS: LlmError['kind'][] = ['no_key', 'invalid_key', 'network', 'rate_limit', 'bad_request', 'timeout'];

export function subscribeGeneration(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(topicId: number): void {
  listeners.forEach((listener) => {
    try {
      listener(topicId);
    } catch {
      // A broken listener must not stop generation.
    }
  });
}

// True while a generation or regenerate of this topic is running in this process. A topic
// whose status is 'generating' while this is false was interrupted and needs a Retry.
export function isGenerating(topicId: number): boolean {
  return running.has(topicId);
}

// Short, user-facing reason for the last failed run of this topic, if any.
export function getGenerationError(topicId: number): string | null {
  return lastErrors.get(topicId) ?? null;
}

function describe(e: unknown): string {
  return e instanceof GenerationError ? e.message : describeLlmError(e);
}

// The model's tidy title, author and icon replace what the learner typed.
async function applyMeta(topicId: number, meta: TopicMeta | null): Promise<void> {
  if (!meta) return;
  await updateTopic(topicId, {
    ...(meta.title ? { title: meta.title } : {}),
    ...(meta.author ? { author: meta.author } : {}),
    ...(meta.icon ? { icon: meta.icon } : {}),
  });
}

async function ensureOutline(topic: Topic): Promise<UnitHead[]> {
  const existing = await listUnitHeads(topic.id);
  if (existing.length > 0) return existing;
  const outline = await buildOutline(topic);
  await insertUnits(topic.id, outline.units);
  await applyMeta(topic.id, outline.meta);
  notify(topic.id);
  return listUnitHeads(topic.id);
}

// A book's chapters (or an upload's parts) are fixed, so a plan too short for them is
// stretched to the fewest days that keep each session at or under the daily maximum.
async function fitPlan(topic: Topic, unitCount: number): Promise<Topic> {
  if (topic.planDays === null) return topic;
  const planDays = fitDays(topic.planDays, unitCount);
  if (planDays !== topic.planDays) await updateTopic(topic.id, { planDays });
  return { ...topic, planDays };
}

// Each unit's share of the plan's card budget; null for topics without a plan (legacy).
async function unitCardCounts(topic: Topic): Promise<number[] | null> {
  if (topic.planDays === null) return null;
  return cardsPerUnit(topic.planDays, await listUnitSourceChars(topic.id));
}

// Source text is loaded one unit at a time, never the whole topic at once.
async function generateUnits(topic: Topic, heads: UnitHead[]): Promise<void> {
  const counts = await unitCardCounts(topic);
  for (const [i, head] of heads.entries()) {
    if (head.genStatus === 'done') continue;
    // The topic may have been deleted while the previous unit was generating.
    if (!(await getTopic(topic.id))) return;
    try {
      const unit = await getUnit(head.id);
      if (!unit) continue;
      const content = await generateUnitContent(topic, unit, heads, counts?.[i] ?? null);
      await replaceCardsForUnit(topic.id, unit.id, content.cards);
      await updateUnit(unit.id, { summary: content.summary, genStatus: 'done' });
    } catch (e) {
      lastErrors.set(topic.id, describe(e));
      await updateUnit(head.id, { genStatus: 'failed' });
      if (e instanceof LlmError && STOP_KINDS.includes(e.kind)) return;
    } finally {
      notify(topic.id);
    }
  }
}

async function generate(topicId: number): Promise<void> {
  const topic = await getTopic(topicId);
  if (!topic) return;
  const before = await listUnitHeads(topicId);
  const complete = before.length > 0 && before.every((c) => c.genStatus === 'done');
  if (complete && (topic.status === 'ready' || topic.status === 'finished')) return;

  lastErrors.delete(topicId);
  await updateTopic(topicId, { status: 'generating' });
  notify(topicId);

  const units = await ensureOutline(topic);
  // Re-read: the outline may have tidied the title.
  const outlined = await fitPlan((await getTopic(topicId)) ?? topic, units.length);
  await generateUnits(outlined, units);

  const current = await getTopic(topicId);
  if (!current) {
    lastErrors.delete(topicId);
    return;
  }
  const after = await listUnitHeads(topicId);
  if (after.length === 0 || after.some((c) => c.genStatus !== 'done')) {
    await updateTopic(topicId, { status: 'failed' });
    return;
  }
  lastErrors.delete(topicId);
  // A topic with a plan (every new topic: its length is picked when adding it, then fitted
  // to the outline) gets its cards placed into sessions, keeping the plan's total length.
  // Legacy topics without a plan keep their cards unassigned until the chat sets one.
  if (current.planDays !== null) await reapplyPlan(topicId, current.planDays);
  await updateTopic(topicId, { status: 'ready' });
}

async function generateOrFail(topicId: number): Promise<void> {
  try {
    await generate(topicId);
  } catch (e) {
    lastErrors.set(topicId, describe(e));
    await updateTopic(topicId, { status: 'failed' }).catch(() => undefined);
  }
}

export async function runGeneration(topicId: number): Promise<void> {
  if (running.has(topicId)) return;
  running.add(topicId);
  try {
    if (!(await hasApiKey())) throw new LlmError('no_key');
    await generateOrFail(topicId);
  } finally {
    running.delete(topicId);
    notify(topicId);
  }
}

async function resumeAll(): Promise<void> {
  try {
    if (!(await hasApiKey())) return;
    const stuck = (await listTopics()).filter((b) => b.status === 'generating');
    for (const topic of stuck) {
      await runGeneration(topic.id).catch(() => undefined);
    }
  } catch {
    // Resuming is best effort; the topic screen offers Retry.
  }
}

let resuming: Promise<void> | null = null;

// Called on every app foreground. One pass at a time: a call made while a pass is still
// working through the topics joins it instead of starting a second, parallel one.
export function resumePendingGenerations(): Promise<void> {
  resuming ??= resumeAll().finally(() => {
    resuming = null;
  });
  return resuming;
}

export async function regenerateCard(cardId: number, note?: string): Promise<void> {
  const card = await getCard(cardId);
  if (!card) return;
  const [topic, unit] = await Promise.all([getTopic(card.topicId), getUnit(card.unitId)]);
  if (!topic || !unit) return;
  const rewritten = await rewriteCard(topic, unit, card, note);
  await updateCardContent(cardId, { type: card.type, ...rewritten });
  notify(topic.id);
}

function fileNameFromUri(uri: string): string {
  return decodeURIComponent(uri.split(/[?#]/)[0].split('/').pop() ?? '') || 'topic.txt';
}

type RegenerateOptions = { fileUri?: string; fileName?: string };
type Replacement = { source: TopicSource; fileUri: string | null; outline: OutlineUnit[]; meta: TopicMeta | null };

// Everything a regenerate needs before it may delete anything: the new file (if one was
// picked) and a validated outline. Throws without touching the topic's rows.
async function prepareReplacement(topic: Topic, opts?: RegenerateOptions): Promise<Replacement> {
  if (!opts?.fileUri) {
    const built = await buildOutline(topic);
    return { source: topic.source, fileUri: topic.fileUri, outline: built.units, meta: built.meta };
  }
  const fileUri = await importSourceFile(opts.fileUri, opts.fileName ?? fileNameFromUri(opts.fileUri));
  try {
    const built = await buildOutline({ ...topic, source: 'uploaded', fileUri });
    return { source: 'uploaded', fileUri, outline: built.units, meta: built.meta };
  } catch (e) {
    if (fileUri !== topic.fileUri) deleteSourceFile(fileUri);
    throw e;
  }
}

// Rejects, leaving the topic exactly as it was, when the new outline cannot be obtained
// (no key, offline, unreadable file). Once the old content is replaced, later failures
// mark the topic 'failed' like any other generation.
export async function regenerateTopic(topicId: number, opts?: RegenerateOptions): Promise<void> {
  if (running.has(topicId)) return;
  running.add(topicId);
  try {
    if (!(await hasApiKey())) throw new LlmError('no_key');
    const topic = await getTopic(topicId);
    if (!topic) return;
    notify(topicId);

    const next = await prepareReplacement(topic, opts);
    await replaceUnitsForTopic(topicId, next.outline);
    await updateTopic(topicId, { source: next.source, fileUri: next.fileUri, status: 'generating' });
    await applyMeta(topicId, next.meta);
    // The old conversation was about content that no longer exists.
    await clearChat(topicId);
    if (topic.fileUri !== next.fileUri) deleteSourceFile(topic.fileUri);
    lastErrors.delete(topicId);
    notify(topicId);

    await generateOrFail(topicId);
  } finally {
    running.delete(topicId);
    notify(topicId);
  }
}
