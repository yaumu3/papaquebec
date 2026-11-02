import { describe, expect, it } from 'bun:test';

import type { Vec2 } from './geo';
import { lengthOf, midpointOf, pointAlong, readingAngle } from './polyline';

describe('lengthOf', () => {
  it('sums the chords of a polyline', () => {
    // Arrange
    const cases: [Vec2[], number][] = [
      [[], 0],
      [[{ x: 1, y: 1 }], 0],
      [
        [
          { x: 0, y: 0 },
          { x: 3, y: 4 },
        ],
        5,
      ],
      [
        [
          { x: 0, y: 0 },
          { x: 3, y: 4 },
          { x: 3, y: 10 },
        ],
        11,
      ],
    ];

    // Act
    const lengths = cases.map(([points]) => lengthOf(points));

    // Assert
    expect(lengths).toEqual(cases.map(([, length]) => length));
  });
});

describe('midpointOf', () => {
  it('finds the point half-way along and the direction of the piece it falls on', () => {
    // Arrange
    const east: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const uneven: Vec2[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 6 },
      { x: 2, y: 12 },
    ];
    const onVertex: Vec2[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
    ];
    const cases = [
      east,
      uneven,
      onVertex,
      [{ x: 1, y: 1 }],
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
      [],
    ];

    // Act
    const found = cases.map((points) => midpointOf(points));

    // Assert
    expect(found).toEqual([
      { at: { x: 5, y: 0 }, direction: { x: 1, y: 0 } },
      { at: { x: 2, y: 5 }, direction: { x: 0, y: 1 } },
      { at: { x: 4, y: 0 }, direction: { x: 0, y: 1 } },
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('readingAngle', () => {
  it('turns a world direction to an upright screen angle, flipping what would read upside down', () => {
    // Arrange
    const cases: [Vec2, number, boolean][] = [
      [{ x: 1, y: 0 }, 0, false],
      [{ x: -1, y: 0 }, 0, true],
      [{ x: 1, y: 1 }, -Math.PI / 4, false],
      [{ x: -1, y: -1 }, -Math.PI / 4, true],
      [{ x: 0, y: 1 }, -Math.PI / 2, false],
      [{ x: 0, y: -1 }, Math.PI / 2, false],
      [{ x: -2, y: 1 }, Math.atan(0.5), true],
    ];

    // Act
    const readings = cases.map(([direction]) => readingAngle(direction));

    // Assert
    expect(readings.map((r) => r.flipped)).toEqual(cases.map(([, , flipped]) => flipped));
    readings.forEach(({ angle }, i) => expect(angle).toBeCloseTo(cases[i]?.[1] ?? NaN, 12));
  });
});

describe('pointAlong', () => {
  const bend = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
  ];

  it('finds the point at a distance, on the piece ahead at a vertex', () => {
    // Arrange
    const distances = [1, 2, 3];

    // Act
    const points = distances.map((distance) => pointAlong(bend, distance));

    // Assert
    expect(points).toEqual([
      { at: { x: 1, y: 0 }, direction: { x: 1, y: 0 } },
      { at: { x: 2, y: 0 }, direction: { x: 0, y: 1 } },
      { at: { x: 2, y: 1 }, direction: { x: 0, y: 1 } },
    ]);
  });

  it('stays on the last piece at the very end, where rounding may put a distance', () => {
    // Arrange
    const distance = 4;

    // Act
    const point = pointAlong(bend, distance);

    // Assert
    expect(point).toEqual({ at: { x: 2, y: 2 }, direction: { x: 0, y: 1 } });
  });
});
