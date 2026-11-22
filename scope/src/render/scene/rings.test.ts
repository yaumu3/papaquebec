import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

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

  it('lists every ring radius at the spacing of the range, up to and including the extent', () => {
    // Arrange: an extent on a ring or just short of or past one, as often as anywhere else
    const anyRange = fc.double({ min: 1, max: 500, noNaN: true });
    const anyExtent = fc.oneof(
      fc.double({ min: 0, max: 600, noNaN: true }),
      fc
        .tuple(fc.integer({ min: 0, max: 120 }), fc.constantFrom(-0.5, 0, 0.5))
        .map(([fives, off]) => fives * 5 + off),
    );

    fc.assert(
      fc.property(anyRange, anyExtent, (range, extent) => {
        // Act
        const radii = ringRadii(range, extent);

        // Assert
        const step = ringStepNm(range);
        expect(radii).toEqual(radii.map((_, i) => (i + 1) * step));
        expect(radii.length * step).toBeLessThanOrEqual(Math.max(extent, 0));
        expect((radii.length + 1) * step).toBeGreaterThan(extent);
      }),
    );
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
