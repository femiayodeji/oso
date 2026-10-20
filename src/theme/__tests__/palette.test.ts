import { describe, expect, it } from '@jest/globals';

import { palette, pickPalette, readingPalette } from '../tokens';

describe('pickPalette', () => {
  it('returns the standard colours for each scheme', () => {
    expect(pickPalette('standard', 'light')).toBe(palette.light);
    expect(pickPalette('standard', 'dark')).toBe(palette.dark);
  });

  it('returns the reading colours for each scheme', () => {
    expect(pickPalette('reading', 'light')).toBe(readingPalette.light);
    expect(pickPalette('reading', 'dark')).toBe(readingPalette.dark);
  });

  it('gives the reading palette every token', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(Object.keys(readingPalette[scheme]).sort()).toEqual(Object.keys(palette[scheme]).sort());
    }
  });
});
