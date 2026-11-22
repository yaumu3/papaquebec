import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { nmPlane, siteProjection } from './tracks';

describe('nmPlane', () => {
  it('turns the scope plane back into the positions projected onto it, the origin into the site', () => {
    // Arrange: sites of the middle latitudes of either hemisphere, and places a few degrees off
    const anySite = fc.record({
      lat: fc.integer({ min: 2000, max: 6000 }).map((n) => n / 100),
      lon: fc.integer({ min: -17000, max: 17000 }).map((n) => n / 100),
      south: fc.boolean(),
    });
    const anyOffset = fc.record({
      lat: fc.integer({ min: -400, max: 400 }).map((n) => n / 100),
      lon: fc.integer({ min: -500, max: 500 }).map((n) => n / 100),
    });

    fc.assert(
      fc.property(anySite, anyOffset, ({ lat, lon, south }, off) => {
        // Arrange
        const site = { lat: south ? -lat : lat, lon };
        const place = { lat: site.lat + off.lat, lon: site.lon + off.lon };
        const { project, unproject } = nmPlane(siteProjection(site));

        // Act
        const [origin, onPlane] = [site, place].map((p) => project(p.lat, p.lon));

        // Assert
        const back = unproject(onPlane?.x ?? NaN, onPlane?.y ?? NaN);
        expect(origin?.x).toBeCloseTo(0, 9);
        expect(origin?.y).toBeCloseTo(0, 9);
        expect(back.lat).toBeCloseTo(place.lat, 9);
        expect(back.lon).toBeCloseTo(place.lon, 9);
      }),
    );
  });
});
