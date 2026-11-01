import { describe, expect, it } from 'bun:test';

import type { Vec2 } from './geo';
import { lengthOf, midpointOf } from './polyline';

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
