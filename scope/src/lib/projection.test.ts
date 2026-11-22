import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { anyBetween } from './numberFixture';
import { createLcc, type Ellipsoid, WGS84 } from './projection';

/** Snyder's worked example uses Clarke 1866. */
const CLARKE_1866: Ellipsoid = { a: 6_378_206.4, invF: 294.9786982 };

describe('Lambert Conformal Conic (ellipsoidal)', () => {
  it('reproduces the Snyder worked example on Clarke 1866', () => {
    // Arrange
    // Snyder, Map Projections: A Working Manual, numerical example for
    // LCC with two standard parallels, ellipsoidal form.
    const lcc = createLcc({ lat0: 23, lon0: -96, lat1: 33, lat2: 45 }, CLARKE_1866);

    // Act
    const p = lcc.forward(35, -75);

    // Assert
    expect(p.x).toBeCloseTo(1_894_410.9, 0);
    expect(p.y).toBeCloseTo(1_564_649.5, 0);
  });

  it('projects the origin to (0, 0)', () => {
    // Arrange
    const lcc = createLcc({ lat0: 33.5844, lon0: 130.4517, lat1: 27.5844, lat2: 39.5844 }, WGS84); // RJFF

    // Act
    const p = lcc.forward(33.5844, 130.4517); // RJFF

    // Assert
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('inverts forward to within a micrometer', () => {
    // Arrange: short of the poles, where the cone closes, and of the meridian opposite the reference
    const lcc = createLcc({ lat0: 33.5844, lon0: 130.4517, lat1: 27.5844, lat2: 39.5844 }, WGS84); // RJFF
    const anyLat = anyBetween(-60, 80);
    const anyLon = anyBetween(130.4517 - 170, 130.4517 + 170);

    fc.assert(
      fc.property(anyLat, anyLon, (lat, lon) => {
        // Arrange
        const p = lcc.forward(lat, lon);

        // Act
        const back = lcc.inverse(p.x, p.y);

        // Assert
        expect(back.lat).toBeCloseTo(lat, 9);
        expect(back.lon).toBeCloseTo(lon, 9);
      }),
    );
  });

  it('is close to true scale near the standard parallels', () => {
    // Arrange
    const lcc = createLcc({ lat0: 33.5844, lon0: 130.4517, lat1: 27.5844, lat2: 39.5844 }, WGS84); // RJFF
    const metersPerDegLat = 110_730; // meridional arc for 27.58°N to 28.58°N

    // Act
    const a = lcc.forward(27.5844, 130.4517); // 6° south of RJFF
    const b = lcc.forward(28.5844, 130.4517); // 5° south of RJFF

    // Assert
    expect(b.y - a.y).toBeCloseTo(metersPerDegLat, -2);
  });

  it('places east of the reference meridian at positive x', () => {
    // Arrange
    const lcc = createLcc({ lat0: 33.5844, lon0: 130.4517, lat1: 27.5844, lat2: 39.5844 }, WGS84); // RJFF

    // Act
    const p = lcc.forward(33.5844, 131.4517); // 1° east of RJFF

    // Assert
    expect(p.x).toBeGreaterThan(90_000);
    expect(p.x).toBeLessThan(94_000);
  });
});
