import { describe, expect, it } from 'bun:test';

import { arcPoints, polygonPoints } from './figure';

const centre = { x: 3, y: -2 };

describe('arcPoints', () => {
  it('runs from one angle to the other on its radius', () => {
    // Arrange
    const radius = 5;

    // Act
    const points = arcPoints(centre, radius, 0, 90, 4);

    // Assert
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ x: 8, y: -2 });
    expect(points[4]?.x).toBeCloseTo(3);
    expect(points[4]?.y).toBeCloseTo(3);
    expect(
      points
        .map((p) => Math.hypot(p.x - centre.x, p.y - centre.y))
        .every((d) => Math.abs(d - radius) < 1e-9),
    ).toBe(true);
  });
});

describe('polygonPoints', () => {
  it('lists each corner once, the first on +x', () => {
    // Arrange
    const sides = 6;

    // Act
    const corners = polygonPoints(centre, 2, sides);

    // Assert
    expect(corners).toHaveLength(6);
    expect(corners[0]).toEqual({ x: 5, y: -2 });
    expect(corners[3]?.x).toBeCloseTo(1);
    expect(corners[3]?.y).toBeCloseTo(-2);
  });
});
