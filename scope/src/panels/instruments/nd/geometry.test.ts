import { describe, expect, it } from 'bun:test';

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

  it('parks the same however far off the arc the bearing is', () => {
    // Arrange
    const rels = [100, 170];

    // Act
    const paths = rels.map((rel) => bugPath(g, rel));

    // Assert
    expect(paths[0]).toBe(paths[1]);
  });
});

const turning = (rateDegS: number) => ({ rateDegS, gsKt: 360 });
const lengthOf = (points: readonly (readonly [number, number])[]): number =>
  points.reduce((sum, p, i, all) => {
    const from = all[i - 1];
    return from ? sum + Math.hypot(p[0] - from[0], p[1] - from[1]) : sum;
  }, 0);

describe('trend vector', () => {
  const g = ndGeometry(346);

  it('steps 90 s at the ground speed scaled to the range, from just above the aircraft', () => {
    // Arrange
    const speed = turning(1);

    // Act
    const points = trendPoints(g, 0, speed, 20);

    // Assert
    expect(points).toHaveLength(91);
    expect(points[0]).toEqual([173, 180]);
    expect(lengthOf(points)).toBeCloseTo(67.05, 6);
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
