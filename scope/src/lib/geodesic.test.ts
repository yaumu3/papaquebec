import { describe, expect, it } from 'bun:test';

import { direct, geodesicCircle, geodesicPath, inverse } from './geodesic';

describe('geodesicCircle', () => {
  it('closes a ring of points, starting due north', () => {
    // Arrange
    const center = { lat: 35.5, lon: 139.8 };

    // Act
    const ring = geodesicCircle(center, 120, 96);

    // Assert
    expect(ring.length).toBe(97);
    expect(ring[96]?.lat).toBeCloseTo(ring[0]?.lat ?? 0, 12);
    expect(ring[96]?.lon).toBeCloseTo(ring[0]?.lon ?? 0, 12);
    expect(ring[0]?.lon).toBeCloseTo(center.lon, 12);
    expect(ring[0]?.lat).toBeGreaterThan(center.lat);
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
