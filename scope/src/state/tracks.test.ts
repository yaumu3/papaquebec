import { describe, expect, it } from 'bun:test';

import { nmPlane, siteProjection } from './tracks';

const NARITA = { lat: 35.765, lon: 140.386 };

describe('nmPlane', () => {
  it('turns the scope plane back into the positions projected onto it, the origin into the site', () => {
    // Arrange
    const { project, unproject } = nmPlane(siteProjection(NARITA));
    const places = [NARITA, { lat: 34.2, lon: 138.1 }, { lat: 37.9, lon: 142.6 }];
    const onPlane = places.map((p) => project(p.lat, p.lon));

    // Act
    const back = onPlane.map((p) => unproject(p.x, p.y));

    // Assert
    back.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(places[i]?.lat ?? 0, 9);
      expect(p.lon).toBeCloseTo(places[i]?.lon ?? 0, 9);
    });
    expect(onPlane[0]?.x).toBeCloseTo(0, 9);
    expect(onPlane[0]?.y).toBeCloseTo(0, 9);
  });
});
