import { describe, expect, it } from 'bun:test';

import { inverse } from '../../lib/geodesic';
import { CIRCLE_SEGMENTS, projectedCircle, ringPaths, ringRadii, ringStepNm } from './rings';

describe('range rings', () => {
  it('spaces rings by 5, 10 or 20 NM depending on the displayed range', () => {
    // Arrange
    const ranges = [10, 20, 40, 80, 200];

    // Act
    const steps = ranges.map(ringStepNm);

    // Assert
    expect(steps).toEqual([5, 5, 10, 10, 20]);
  });

  it('lists every ring radius up to and including the range', () => {
    // Arrange
    const range = 40;

    // Act
    const radii = ringRadii(range, range);

    // Assert
    expect(radii).toEqual([10, 20, 30, 40]);
  });

  it('handles ranges between presets, stopping at the last full step', () => {
    // Arrange
    const range = 35;

    // Act
    const radii = ringRadii(range, range);

    // Assert
    expect(radii).toEqual([10, 20, 30]);
  });

  it('keeps the range spacing for rings out to a wider extent', () => {
    // Arrange
    const range = 40;
    const extent = 65;

    // Act
    const radii = ringRadii(range, extent);

    // Assert
    expect(radii).toEqual([10, 20, 30, 40, 50, 60]);
  });
});

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

describe('ringPaths', () => {
  it('works each ring out once, however often it is drawn', () => {
    // Arrange
    let projected = 0;
    const paths = ringPaths(NARITA, (lat, lon) => {
      projected++;
      return flat(lat, lon);
    });
    const first = paths(20);

    // Act
    const again = paths(20);

    // Assert
    expect(again).toBe(first);
    expect(projected).toBe(CIRCLE_SEGMENTS + 1);
  });
});
