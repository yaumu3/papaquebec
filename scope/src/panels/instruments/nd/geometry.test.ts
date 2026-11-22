import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { bugPath, levelOffPath, ndGeometry, trendPoints } from './geometry';

describe('ndGeometry', () => {
  it('takes the whole of its size from the width, whichever limit binds', () => {
    // Arrange
    const widths = [346, 200];

    // Act
    const out = widths.map(ndGeometry);

    // Assert
    expect(out).toEqual([
      { w: 346, h: 230, cx: 173, cy: 189, r: 149, r2: 74.5 },
      { w: 200, h: 133, cx: 100, cy: 113, r: 73, r2: 36.5 },
    ]);
  });
});

describe('bugPath', () => {
  const g = ndGeometry(346);

  it('parks the same however far off the arc the bearing is, at the end of its side', () => {
    // Arrange: past the 75° the arc spans either side
    const anyOff = fc.integer({ min: 751, max: 1800 }).map((n) => n / 10);
    const anySide = fc.constantFrom(1, -1);

    fc.assert(
      fc.property(anyOff, anySide, (off, side) => {
        // Act
        const paths = [off, 90].map((rel) => bugPath(g, side * rel));

        // Assert
        expect(paths[0]).toBe(paths[1]);
      }),
    );
  });
});

const lengthOf = (points: readonly (readonly [number, number])[]): number =>
  points.reduce((sum, p, i, all) => {
    const from = all[i - 1];
    return from ? sum + Math.hypot(p[0] - from[0], p[1] - from[1]) : sum;
  }, 0);

describe('trend vector', () => {
  const g = ndGeometry(346);

  it('steps 90 s at the ground speed scaled to the range, from just above the aircraft, however it turns', () => {
    // Arrange
    const anyTrend = fc.record({
      rateDegS: fc.integer({ min: -60, max: 60 }).map((n) => n / 10),
      gsKt: fc.integer({ min: 0, max: 600 }),
    });
    const anyBearing = fc.integer({ min: -1800, max: 1800 }).map((n) => n / 10);
    const anyRange = fc.constantFrom(10, 20, 40, 80);

    fc.assert(
      fc.property(anyTrend, anyBearing, anyRange, (trend, at, rangeNm) => {
        // Act
        const points = trendPoints(g, at, trend, rangeNm);

        // Assert
        const pxPerNm = g.r / rangeNm;
        expect(points).toHaveLength(91);
        expect(points[0]).toEqual([173, 180]);
        expect(lengthOf(points)).toBeCloseTo((trend.gsKt / 3600) * 90 * pxPerNm, 6);
      }),
    );
  });
});

describe('levelOffPath', () => {
  const g = ndGeometry(346);

  it('draws none too near the aircraft or at or beyond the arc', () => {
    // Arrange
    const nms = [1, 25, 20];

    // Act
    const paths = nms.map((nm) => levelOffPath(g, 0, nm, 20));

    // Assert
    expect(paths).toEqual(['', '', '']);
  });
});
