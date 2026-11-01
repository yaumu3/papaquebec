import { describe, expect, it } from 'bun:test';

import type { Vec2 } from './geo';
import { lengthOf } from './polyline';

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
