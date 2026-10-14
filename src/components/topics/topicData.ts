import * as DocumentPicker from 'expo-document-picker';

import { getTopic, listTopics } from '../../db/topics';
import { getUnitProgress, listUnitHeads, type UnitHead } from '../../db/units';
import { listSessions } from '../../db/sessions';
import type { Topic, TopicStatus, Session } from '../../types';

export interface TopicSummary {
  topic: Topic;
  sessionsDone: number;
  sessionsTotal: number;
  units: { done: number; total: number };
}

export interface TopicDetail extends TopicSummary {
  unitList: UnitHead[];
  sessions: Session[];
}

async function summarize(topic: Topic): Promise<TopicSummary & { sessions: Session[] }> {
  const [sessions, units] = await Promise.all([listSessions(topic.id), getUnitProgress(topic.id)]);
  return {
    topic,
    sessions,
    units,
    sessionsDone: sessions.filter((t) => t.completedAt).length,
    sessionsTotal: sessions.length,
  };
}

export async function loadTopics(): Promise<TopicSummary[]> {
  const topics = await listTopics();
  return Promise.all(topics.map(summarize));
}

export async function loadTopicDetail(id: number): Promise<TopicDetail | null> {
  const topic = await getTopic(id);
  if (!topic) return null;
  const [summary, unitList] = await Promise.all([summarize(topic), listUnitHeads(id)]);
  return { ...summary, unitList };
}

export function statusLine({ topic, sessionsDone, sessionsTotal, units }: TopicSummary): string {
  const byStatus: Record<TopicStatus, string> = {
    draft: 'Waiting to start',
    generating: units.total > 0 ? `Preparing units, ${units.done} of ${units.total}` : 'Preparing units…',
    failed: 'Preparation failed',
    finished: `Finished · ${sessionsTotal} sessions`,
    ready: sessionsTotal > 0 ? `${sessionsDone} of ${sessionsTotal} sessions done` : 'Ready · no plan yet',
  };
  return byStatus[topic.status];
}

export interface PickedFile {
  uri: string;
  name: string;
}

const SOURCE_FILE = /\.(pdf|epub|txt|md|markdown)$/i;

// Returns null when the user cancels. Throws a readable error for unsupported files.
export async function pickSourceFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Markdown has no reliable MIME type on Android, so the extension is checked below.
    type: ['application/pdf', 'application/epub+zip', 'text/*', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (!SOURCE_FILE.test(asset.name)) throw new Error('Pick a .pdf, .epub, .txt or .md file.');
  return { uri: asset.uri, name: asset.name };
}
