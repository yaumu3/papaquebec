import { describe, expect, it } from 'bun:test';

import {
  distanceToSegment,
  flatDistanceNm,
  trueToMagnetic,
  velocityNm,
  nearest,
  rankByDistance,
  splitByCircle,
} from './geo';
import { direct, inverse } from './geodesic';

describe('trueToMagnetic', () => {
  it('subtracts east declination and wraps into 0..360', () => {
    // Arrange
    const cases: [number, number, number][] = [
      [10, 7.5, 2.5],
      [3, 7.5, 355.5],
      [355, -7.5, 2.5],
      [180, 0, 180],
    ];

    // Act
    const results = cases.map(([t, decl]) => trueToMagnetic(t, decl));

    // Assert
    results.forEach((m, i) => expect(m).toBeCloseTo(cases[i]?.[2] ?? NaN, 9));
  });
});

describe('velocityNm', () => {
  it('splits ground speed along a true track into east and north knots', () => {
    // Arrange
    const gs = 100;
    const track = 90;

    // Act
    const v = velocityNm(gs, track);

    // Assert
    expect(v.x).toBeCloseTo(100, 9);
    expect(v.y).toBeCloseTo(0, 9);
  });
});

describe('distanceToSegment', () => {
  it('measures to the nearest point on the segment, including its ends', () => {
    // Arrange
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const points = [
      { x: 5, y: 3 },
      { x: -4, y: 0 },
      { x: 13, y: 4 },
      { x: 10, y: 0 },
    ];

    // Act
    const d = points.map((p) => distanceToSegment(p, a, b));

    // Assert
    expect(d).toEqual([3, 4, 5, 0]);
  });

  it('degenerates to point distance when the segment has no length', () => {
    // Arrange
    const a = { x: 1, y: 1 };

    // Act
    const d = distanceToSegment({ x: 4, y: 5 }, a, a);

    // Assert
    expect(d).toBe(5);
  });
});

describe('nearest', () => {
  it('picks the item closest to the point on the sphere, or null when there are none', () => {
    // Arrange
    const items = [
      { id: 'RJTT', lat: 35.553, lon: 139.781 },
      { id: 'RJAA', lat: 35.765, lon: 140.386 },
      { id: 'RJAH', lat: 36.181, lon: 140.415 },
    ];

    // Act
    const hit = nearest(35.6, 139.9, items); // Tokyo Bay
    const none = nearest(35.6, 139.9, []);

    // Assert
    expect(hit?.id).toBe('RJTT');
    expect(none).toBeNull();
  });
});

describe('flatDistanceNm', () => {
  it('is within 1% of the geodesic over a few nautical miles, at any latitude and across the antimeridian', () => {
    // Arrange
    const rows: [number, number, number, number][] = [
      [0, 140, 90, 1],
      [35.5, 139.8, 45, 1],
      [35.5, 139.8, 0, 5],
      [60, 10, 180, 1],
      [60, 10, 90, 5],
    ];
    const east = { lat: 35, lon: 179.99 };
    const west = { lat: 35, lon: -179.99 };
    const pairs = [
      ...rows.map(([lat, lon, bearing, nm]) => {
        const from = { lat, lon };
        return { from, to: direct(from, bearing, nm) };
      }),
      { from: east, to: west },
      { from: west, to: east },
    ];

    // Act
    const ratios = pairs.map(
      ({ from, to }) => flatDistanceNm(from, to) / inverse(from, to).distanceNm,
    );

    // Assert
    expect(ratios.map((r) => Math.abs(r - 1) < 0.01)).toEqual(pairs.map(() => true));
  });
});

describe('rankByDistance', () => {
  it('orders items nearest first without touching the input', () => {
    // Arrange
    const items = [
      { id: 'RJAH', lat: 36.181, lon: 140.415 },
      { id: 'RJTT', lat: 35.553, lon: 139.781 },
      { id: 'RJAA', lat: 35.765, lon: 140.386 },
    ];

    // Act
    const out = rankByDistance(35.6, 139.9, items); // Tokyo Bay

    // Assert
    expect(out.map((a) => a.id)).toEqual(['RJTT', 'RJAA', 'RJAH']);
    expect(items[0]?.id).toBe('RJAH');
  });
});

/** A point at `x`, `y`, on the x axis unless told otherwise. */
const at = (x: number, y = 0) => ({ x, y });

describe('splitByCircle', () => {
  it('cuts a segment where it enters and leaves a circle, if it does', () => {
    // Arrange: a unit circle about the origin
    const c = { x: 0, y: 0 };
    const cases = [
      { name: 'through', p: { x: -3, y: 0 }, q: { x: 3, y: 0 } },
      { name: 'into', p: { x: -3, y: 0 }, q: { x: 0, y: 0 } },
      { name: 'within', p: { x: -0.5, y: 0 }, q: { x: 0.5, y: 0 } },
      { name: 'past', p: { x: -3, y: 2 }, q: { x: 3, y: 2 } },
      { name: 'short of', p: { x: -3, y: 0 }, q: { x: -2, y: 0 } },
    ];

    // Act
    const split = cases.map((s) => [s.name, splitByCircle(s.p, s.q, c, 1)]);

    // Assert
    expect(split).toEqual([
      [
        'through',
        {
          outside: [
            [at(-3), at(-1)],
            [at(1), at(3)],
          ],
          inside: [[at(-1), at(1)]],
        },
      ],
      ['into', { outside: [[at(-3), at(-1)]], inside: [[at(-1), at(0)]] }],
      ['within', { outside: [], inside: [[at(-0.5), at(0.5)]] }],
      ['past', { outside: [[at(-3, 2), at(3, 2)]], inside: [] }],
      ['short of', { outside: [[at(-3), at(-2)]], inside: [] }],
    ]);
  });
});
