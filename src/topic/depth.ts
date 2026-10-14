// How deep a topic goes. Topics get a syllabus of `units`; books keep their real chapters,
// so depth only changes how many cards each unit gets.
export type Depth = 'quick' | 'solid' | 'deep';

export const DEPTHS: Record<Depth, { label: string; note: string; units: [number, number]; cards: [number, number] }> = {
  quick: { label: 'Quick taste', note: 'About 5 short units', units: [4, 6], cards: [4, 6] },
  solid: { label: 'Solid', note: 'About 10 units', units: [8, 12], cards: [6, 9] },
  deep: { label: 'Deep dive', note: 'About 20 units', units: [16, 24], cards: [8, 12] },
};

export const DEFAULT_DEPTH: Depth = 'solid';

export function toDepth(value: string | null | undefined): Depth | null {
  return value === 'quick' || value === 'solid' || value === 'deep' ? value : null;
}
