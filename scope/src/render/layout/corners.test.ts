import { describe, expect, it } from 'bun:test';

import { nearestCorner } from './labels';

describe('nearestCorner', () => {
  it('picks the quadrant the offset points into', () => {
    // Arrange
    const offsets: [number, number][] = [
      [30, -20],
      [-30, -20],
      [30, 20],
      [-30, 20],
      [0, 0],
    ];

    // Act
    const corners = offsets.map(([dx, dy]) => nearestCorner(dx, dy));

    // Assert
    expect(corners).toEqual(['ne', 'nw', 'se', 'sw', 'ne']);
  });
});
