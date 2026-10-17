// Legacy: how deep a topic goes, for topics made before the plan length was chosen up front
// (those have plan_days null). New topics are sized by src/plan/budget.ts instead.
// Topics got a syllabus of `units`; books kept their real chapters, so depth only changed
// how many cards each unit got.
export type Depth = 'quick' | 'solid' | 'deep';

export const DEPTHS: Record<Depth, { units: [number, number]; cards: [number, number] }> = {
  quick: { units: [4, 6], cards: [4, 6] },
  solid: { units: [8, 12], cards: [6, 9] },
  deep: { units: [16, 24], cards: [8, 12] },
};

export const DEFAULT_DEPTH: Depth = 'solid';

export function toDepth(value: string | null | undefined): Depth | null {
  return value === 'quick' || value === 'solid' || value === 'deep' ? value : null;
}
