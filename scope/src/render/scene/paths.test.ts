import { describe, expect, it } from 'bun:test';

import { inverse } from '../../lib/geodesic';
import { CIRCLE_SEGMENTS, projectedCircle } from './paths';

/** Lat/lon as the plane, so a test can read the geodesic straight off the anchors. */
const flat = (lat: number, lon: number) => ({ x: lon, y: lat });
const NARITA = { lat: 35.765, lon: 140.386 };

describe('projectedCircle', () => {
  it('draws the geodesic circle, closed, from its due-north point', () => {
    // Arrange
    const radiusNm = 120;

    // Act
    const path = projectedCircle(NARITA, radiusNm, flat);

    // Assert
    expect(path.length).toBe(CIRCLE_SEGMENTS + 1);
    expect(path[0]?.x).toBeCloseTo(NARITA.lon, 12);
    expect(path[0]?.y).toBeGreaterThan(NARITA.lat);
    expect(path.at(-1)).toEqual(path[0]);
    const off = path.map((p) => Math.abs(inverse(NARITA, { lat: p.y, lon: p.x }).distanceNm - 120));
    expect(Math.max(...off)).toBeLessThan(1e-6);
  });
});
