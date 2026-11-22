import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

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

describe('pointAlong, past the end', () => {
  it('gives the end of the last piece', () => {
    // Arrange
    const line = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ];

    // Act
    const point = pointAlong(line, 5);

    // Assert
    expect(point).toEqual({ at: { x: 2, y: 0 }, direction: { x: 1, y: 0 } });
  });
});

describe('readingAngle', () => {
  it('turns a world direction to an upright screen angle, flipping what would read upside down', () => {
    // Arrange
    const anyPart = fc.integer({ min: -10, max: 10 });
    const anyDirection = fc
      .record({ x: anyPart, y: anyPart })
      .filter(({ x, y }) => x !== 0 || y !== 0);

    fc.assert(
      fc.property(anyDirection, (direction) => {
        // Arrange
        const length = Math.hypot(direction.x, direction.y);

        // Act
        const { angle, flipped } = readingAngle(direction);

        // Assert: the text runs along the direction, or against it once flipped
        const along = direction.x * Math.cos(angle) - direction.y * Math.sin(angle);
        expect(Math.abs(angle)).toBeLessThanOrEqual(Math.PI / 2);
        expect(along).toBeCloseTo(flipped ? -length : length, 9);
      }),
    );
  });

  it('keeps a quarter turn either way as it is', () => {
    // Arrange
    const directions: Vec2[] = [
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    // Act
    const readings = directions.map(readingAngle);

    // Assert
    expect(readings).toEqual([
      { angle: -Math.PI / 2, flipped: false },
      { angle: Math.PI / 2, flipped: false },
    ]);
  });
});

describe('pointAlong', () => {
  const bend = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
  ];

  it('finds the point at a distance, on the piece ahead at a vertex', () => {
    // Arrange: a line of pieces with some length, a piece of it and eighths of the way along that piece
    const anyStep = fc
      .record({ x: fc.integer({ min: -5, max: 5 }), y: fc.integer({ min: -5, max: 5 }) })
      .filter(({ x, y }) => x !== 0 || y !== 0);
    const anyPlace = fc.array(anyStep, { minLength: 1, maxLength: 6 }).chain((steps) =>
      fc.record({
        steps: fc.constant(steps),
        piece: fc.nat(steps.length - 1),
        eighths: fc.nat(7),
      }),
    );

    fc.assert(
      fc.property(anyPlace, ({ steps, piece, eighths }) => {
        // Arrange
        const line = [{ x: 0, y: 0 }];
        for (const { x, y } of steps) {
          const last = line.at(-1) ?? { x: 0, y: 0 };
          line.push({ x: last.x + x, y: last.y + y });
        }
        const from = line[piece] ?? { x: NaN, y: NaN };
        const step = steps[piece] ?? { x: NaN, y: NaN };
        const chord = Math.hypot(step.x, step.y);
        const distance = lengthOf(line.slice(0, piece + 1)) + (chord * eighths) / 8;

        // Act
        const point = pointAlong(line, distance);

        // Assert
        expect(point?.at.x).toBeCloseTo(from.x + (step.x * eighths) / 8, 9);
        expect(point?.at.y).toBeCloseTo(from.y + (step.y * eighths) / 8, 9);
        expect(point?.direction.x).toBeCloseTo(step.x / chord, 12);
        expect(point?.direction.y).toBeCloseTo(step.y / chord, 12);
      }),
    );
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
