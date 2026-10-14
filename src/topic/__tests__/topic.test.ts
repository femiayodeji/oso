import { DEPTHS, toDepth } from '../depth';
import { iconColorIndex, toTopicIcon } from '../icons';
import { pickSuggestions, SUGGESTIONS } from '../suggestions';

describe('toTopicIcon', () => {
  it('accepts listed icons, ignoring case and spaces', () => {
    expect(toTopicIcon('flask')).toBe('flask');
    expect(toTopicIcon(' Code-Slash ')).toBe('code-slash');
  });

  it('rejects anything else', () => {
    expect(toTopicIcon('skull')).toBeNull();
    expect(toTopicIcon('')).toBeNull();
    expect(toTopicIcon(null)).toBeNull();
    expect(toTopicIcon(undefined)).toBeNull();
  });
});

describe('iconColorIndex', () => {
  it('is stable and in range, including for odd ids', () => {
    expect(iconColorIndex(7, 5)).toBe(2);
    expect(iconColorIndex(7, 5)).toBe(iconColorIndex(7, 5));
    expect(iconColorIndex(-3, 5)).toBe(2);
  });
});

describe('toDepth', () => {
  it('reads stored depths and rejects others', () => {
    expect(toDepth('quick')).toBe('quick');
    expect(toDepth('deep')).toBe('deep');
    expect(toDepth('huge')).toBeNull();
    expect(toDepth(null)).toBeNull();
  });

  it('grows with depth', () => {
    expect(DEPTHS.quick.units[1]).toBeLessThan(DEPTHS.solid.units[0]);
    expect(DEPTHS.solid.units[1]).toBeLessThan(DEPTHS.deep.units[0]);
  });
});

describe('pickSuggestions', () => {
  it('returns distinct suggestions, stable for a seed', () => {
    const picked = pickSuggestions(6, 42);
    expect(new Set(picked).size).toBe(6);
    expect(pickSuggestions(6, 42)).toEqual(picked);
    expect(pickSuggestions(6, 43)).not.toEqual(picked);
  });

  it('never asks for more than exist, and handles negative seeds', () => {
    expect(pickSuggestions(100, 1)).toHaveLength(SUGGESTIONS.length);
    expect(new Set(pickSuggestions(SUGGESTIONS.length, -5)).size).toBe(SUGGESTIONS.length);
  });
});
