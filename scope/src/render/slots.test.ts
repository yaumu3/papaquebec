import { describe, expect, it } from 'bun:test';

import { MAP_SLOTS, SLOT_ORDER, type SlotName } from './slots';

const at = (name: SlotName) => SLOT_ORDER.indexOf(name);

describe('SLOT_ORDER', () => {
  it('draws the map over the rings, and the live slots over the map, last', () => {
    // Arrange
    const live: SlotName[] = ['targets', 'hover', 'overlays'];

    // Act
    const [rings, map, moving] = [at('rings'), MAP_SLOTS.map(at), live.map(at)];

    // Assert
    expect(Math.min(...map)).toBeGreaterThan(rings);
    expect(Math.max(...map)).toBeLessThan(Math.min(...moving));
    expect(moving).toEqual([SLOT_ORDER.length - 3, SLOT_ORDER.length - 2, SLOT_ORDER.length - 1]);
  });
});
