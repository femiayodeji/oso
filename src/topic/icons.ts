// The icons a topic can have. The model picks one by name; anything else falls back to null.
// Names are Ionicons glyphs, so the UI can render them directly.
export const TOPIC_ICONS = [
  'book',
  'bulb',
  'code-slash',
  'flask',
  'calculator',
  'hourglass',
  'cash',
  'fitness',
  'leaf',
  'color-palette',
  'musical-notes',
  'language',
  'earth',
  'rocket',
  'people',
  'heart',
  'chatbubbles',
  'briefcase',
  'compass',
  'game-controller',
  'restaurant',
  'hardware-chip',
  'planet',
  'paw',
] as const;

export type TopicIcon = (typeof TOPIC_ICONS)[number];

export function toTopicIcon(value: string | null | undefined): TopicIcon | null {
  const name = value?.trim().toLowerCase();
  return (TOPIC_ICONS as readonly string[]).includes(name ?? '') ? (name as TopicIcon) : null;
}

// Each topic gets one of the celebration colours, stable for its id.
export function iconColorIndex(topicId: number, colorCount: number): number {
  return ((topicId % colorCount) + colorCount) % colorCount;
}
