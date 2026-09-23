import { describe, expect, it } from 'bun:test';

import {
  bearingTrue,
  closestApproach,
  distanceNm,
  distanceToSegment,
  trueToMagnetic,
  velocityNm,
  nearest,
  rankByDistance,
} from './geo';

describe('bearingTrue', () => {
  it('measures clockwise from north on the projected plane', () => {
    // Arrange
    const cases: [number, number, number][] = [
      [0, 10, 0],
      [10, 0, 90],
      [0, -10, 180],
      [-10, 0, 270],
      [10, 10, 45],
    ];

    // Act
    const results = cases.map(([dx, dy]) => bearingTrue(dx, dy));

    // Assert
    results.forEach((b, i) => expect(b).toBeCloseTo(cases[i]?.[2] ?? NaN, 9));
  });
});

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

describe('distanceNm', () => {
  it('is the Euclidean distance on the projected plane', () => {
    // Arrange
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6 };

    // Act
    const d = distanceNm(a, b);

    // Assert
    expect(d).toBe(5);
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

describe('closestApproach', () => {
  it('finds the CPA of two converging targets', () => {
    // Arrange
    const a = { pos: { x: 0, y: 0 }, vel: { x: 60, y: 0 } };
    const b = { pos: { x: 10, y: 5 }, vel: { x: 0, y: 0 } };

    // Act
    const r = closestApproach(a, b);

    // Assert
    expect(r.kind).toBe('converging');
    if (r.kind === 'converging') {
      expect(r.distanceNm).toBeCloseTo(5, 9);
      expect(r.seconds).toBeCloseTo(600, 6);
    }
  });

  it('reports diverging targets', () => {
    // Arrange
    const a = { pos: { x: 0, y: 0 }, vel: { x: -60, y: 0 } };
    const b = { pos: { x: 10, y: 5 }, vel: { x: 0, y: 0 } };

    // Act
    const r = closestApproach(a, b);

    // Assert
    expect(r.kind).toBe('diverging');
  });

  it('reports co-speed targets with their fixed separation', () => {
    // Arrange
    const a = { pos: { x: 0, y: 0 }, vel: { x: 60, y: 0 } };
    const b = { pos: { x: 3, y: 4 }, vel: { x: 60, y: 0 } };

    // Act
    const r = closestApproach(a, b);

    // Assert
    expect(r).toEqual({ kind: 'co-speed', distanceNm: 5 });
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
