import { describe, expect, it } from 'bun:test';

import type { ItemPart } from '../../lib/chart';
import { stratumTag } from '../../lib/stratum';
import { ATLAS_CHARS } from './build';

const sector = (lower?: string, upper?: string): ItemPart => ({
  geometry: { type: 'Polygon', coordinates: [] },
  properties: {
    layer: 'sector',
    name: 'X',
    ...(lower ? { lower } : {}),
    ...(upper ? { upper } : {}),
  },
});

describe('ATLAS_CHARS', () => {
  it('holds every character a stratum tag writes', () => {
    // Arrange
    const tags = [
      stratumTag([sector(undefined, 'FL335')]),
      stratumTag([sector('FL335')]),
      stratumTag([sector('FL250', 'FL335')]),
    ];
    // Precondition: each tag writes something, so the check below is not vacuous.
    expect(tags.every((tag) => tag !== '')).toBe(true);

    // Act
    const missing = tags.flatMap((tag) => Array.from(tag).filter((c) => !ATLAS_CHARS.includes(c)));

    // Assert
    expect(missing).toEqual([]);
  });
});
