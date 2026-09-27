import { describe, expect, it } from 'bun:test';

import { CIRCLE_SEGMENTS } from './paths';
import { ringPaths, ringRadii, ringStepNm } from './rings';

describe('range rings', () => {
  it('spaces rings by 5, 10, 20 or 50 NM depending on the displayed range', () => {
    // Arrange
    const ranges = [10, 20, 40, 80, 160, 200, 400, 500];

    // Act
    const steps = ranges.map(ringStepNm);

    // Assert
    expect(steps).toEqual([5, 5, 10, 10, 20, 50, 50, 50]);
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
