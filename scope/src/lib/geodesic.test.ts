import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { direct, geodesicCircle, geodesicLine, geodesicPath, inverse } from './geodesic';

describe('geodesicCircle', () => {
  it('closes a ring of points at its radius, starting due north', () => {
    // Arrange: a centre whose ring stays short of the poles
    const anyCenter = fc.record({
      lat: fc.integer({ min: -80, max: 80 }),
      lon: fc.integer({ min: -179, max: 179 }),
    });
    const anyRadius = fc.integer({ min: 1, max: 300 });
    const anySegments = fc.integer({ min: 1, max: 96 });

    fc.assert(
      fc.property(anyCenter, anyRadius, anySegments, (center, radiusNm, segments) => {
        // Act
        const ring = geodesicCircle(center, radiusNm, segments);

        // Assert
        const radii = ring.map((point) => inverse(center, point).distanceNm);
        expect(ring.length).toBe(segments + 1);
        expect(ring[segments]).toEqual(ring[0] ?? center);
        expect(ring[0]?.lon).toBeCloseTo(center.lon, 9);
        expect(ring[0]?.lat).toBeGreaterThan(center.lat);
        expect(radii.map((radius) => Math.abs(radius - radiusNm) < 1e-6)).toEqual(
          ring.map(() => true),
        );
      }),
    );
  });
});

/** Longitude and latitude as the plane: great circles curve on it, meridians and the equator don't. */
const lonLat = (lat: number, lon: number) => ({ x: lon, y: lat });

describe('geodesicPath', () => {
  it('keeps an edge whose chord already follows the geodesic as a single piece', () => {
    // Arrange
    const meridian = [
      { lat: 35, lon: 140 },
      { lat: 38, lon: 140 },
    ];

    // Act
    const path = geodesicPath(meridian, lonLat, 0.001);

    // Assert
    expect(path).toEqual([lonLat(35, 140), lonLat(38, 140)]);
  });

  it('splits a curving edge into pieces that each keep within the tolerance', () => {
    // Arrange
    const a = { lat: 35, lon: 130 };
    const b = { lat: 35, lon: 150 };
    const tolerance = 0.001;

    // Act
    const path = geodesicPath([a, b], lonLat, tolerance);

    // Assert
    expect(path[0]).toEqual(lonLat(a.lat, a.lon));
    expect(path.at(-1)).toEqual(lonLat(b.lat, b.lon));
    expect(path.length).toBeGreaterThan(2);
    const bows = path.slice(1).map((q, i) => {
      const p = path[i] ?? q;
      const route = inverse({ lat: p.y, lon: p.x }, { lat: q.y, lon: q.x });
      const mid = direct({ lat: p.y, lon: p.x }, route.bearingTrue, route.distanceNm / 2);
      return Math.hypot(mid.lon - (p.x + q.x) / 2, mid.lat - (p.y + q.y) / 2);
    });
    expect(Math.max(...bows)).toBeLessThan(tolerance);
  });
});

describe('geodesicLine', () => {
  it('is the geodesic path through positions given as longitude and latitude', () => {
    // Arrange
    const positions: [number, number][] = [
      [130, 35],
      [150, 35],
    ];
    const expected = geodesicPath(
      [
        { lat: 35, lon: 130 },
        { lat: 35, lon: 150 },
      ],
      lonLat,
    );

    // Act
    const line = geodesicLine(positions, lonLat);

    // Assert
    expect(line).toEqual(expected);
  });
});
