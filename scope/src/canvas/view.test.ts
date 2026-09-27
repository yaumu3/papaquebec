import { describe, expect, it } from 'bun:test';

import { halfLongEdgeNm, pxPerNmFor } from './view';

describe('halfLongEdgeNm', () => {
  it('measures from the centre to the longer canvas edge in NM', () => {
    // Arrange
    const sizes: [number, number][] = [
      [800, 600],
      [600, 800],
    ];

    // Act
    const extents = sizes.map(([w, h]) => halfLongEdgeNm(w, h, 40));

    // Assert
    for (const e of extents) expect(e * pxPerNmFor(800, 600, 40)).toBeCloseTo(400);
  });
});
