import { describe, expect, it } from 'bun:test';

import { LAYER_ORDER, type LayerName, MAP_LAYERS } from './layers';

const at = (name: LayerName) => LAYER_ORDER.indexOf(name);

describe('LAYER_ORDER', () => {
  it('draws the map over the rings, and the live layers over the map, last', () => {
    // Arrange
    const live: LayerName[] = ['targets', 'hover', 'overlays'];

    // Act
    const [rings, map, moving] = [at('rings'), MAP_LAYERS.map(at), live.map(at)];

    // Assert
    expect(Math.min(...map)).toBeGreaterThan(rings);
    expect(Math.max(...map)).toBeLessThan(Math.min(...moving));
    expect(moving).toEqual([
      LAYER_ORDER.length - 3,
      LAYER_ORDER.length - 2,
      LAYER_ORDER.length - 1,
    ]);
  });
});
