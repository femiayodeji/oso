import { describe, expect, it, jest } from '@jest/globals';

import { DEFAULT_SETTINGS, parseSettings } from '../settings';

jest.mock('../index', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }));

describe('parseSettings', () => {
  it('defaults the palette to standard', () => {
    expect(parseSettings(new Map()).palette).toBe('standard');
    expect(DEFAULT_SETTINGS.palette).toBe('standard');
  });

  it('reads a stored reading palette', () => {
    expect(parseSettings(new Map([['palette', 'reading']])).palette).toBe('reading');
  });

  it('falls back to standard for an unknown palette', () => {
    expect(parseSettings(new Map([['palette', 'neon']])).palette).toBe('standard');
  });
});
