import { describe, expect, it } from 'bun:test';

import { NM_IN_METERS } from './geo';
import { direct, geodesicCircle, inverse } from './geodesic';

/** Round trips agree to about 2 mm and 0.004″, far finer than the scope shows. */
const NM_TOLERANCE = 1e-6;
const DEG_TOLERANCE = 1e-6;

const dms = (d: number, m: number, s: number) => Math.sign(d) * (Math.abs(d) + m / 60 + s / 3600);

/** Vincenty's worked example (Survey Review XXIII/176, 1975), as Geoscience Australia states it. */
const FLINDERS_PEAK = { lat: dms(-37, 57, 3.7203), lon: dms(144, 25, 29.5244) };
const BUNINYONG = { lat: dms(-37, 39, 10.1561), lon: dms(143, 55, 35.3839) };

describe('inverse', () => {
  it("reproduces Vincenty's worked example to the millimetre and the hundredth of a second", () => {
    // Arrange
    const expected = { metres: 54_972.271, bearing: dms(306, 52, 5.37) };

    // Act
    const { distanceNm, bearingTrue } = inverse(FLINDERS_PEAK, BUNINYONG);

    // Assert
    expect(Math.abs(distanceNm * NM_IN_METERS - expected.metres)).toBeLessThan(0.001);
    expect(Math.abs(bearingTrue - expected.bearing) * 3600).toBeLessThan(0.01);
  });

  it('heads due north or south along a meridian, and measures nothing between a point and itself', () => {
    // Arrange
    const from = { lat: 35, lon: 140 };
    const to = [
      { lat: 36, lon: 140 },
      { lat: 34, lon: 140 },
      { lat: 35, lon: 140 },
    ];

    // Act
    const found = to.map((p) => inverse(from, p));

    // Assert
    expect(found.map((r) => r.bearingTrue)).toEqual([0, 180, 0]);
    expect(found[2]?.distanceNm).toBe(0);
    expect(found[0]?.distanceNm).toBeCloseTo(found[1]?.distanceNm ?? 0, 0);
  });
});

describe('direct', () => {
  it("lands on Buninyong from Flinders Peak, as Vincenty's example does", () => {
    // Arrange
    const course = dms(306, 52, 5.37);
    const distanceNm = 54_972.271 / NM_IN_METERS;

    // Act
    const p = direct(FLINDERS_PEAK, course, distanceNm);

    // Assert
    expect(Math.abs(p.lat - BUNINYONG.lat) * 3600).toBeLessThan(0.0001);
    expect(Math.abs(p.lon - BUNINYONG.lon) * 3600).toBeLessThan(0.0001);
  });

  it('comes back through the inverse with the same distance and course', () => {
    // Arrange
    const from = { lat: 35.5, lon: 139.8 };
    const legs = [
      { course: 0, nm: 200 },
      { course: 90, nm: 200 },
      { course: 225, nm: 37.5 },
      { course: 313, nm: 400 },
    ];

    // Act
    const back = legs.map((leg) => inverse(from, direct(from, leg.course, leg.nm)));

    // Assert
    back.forEach((r, i) => {
      expect(Math.abs(r.distanceNm - (legs[i]?.nm ?? 0))).toBeLessThan(NM_TOLERANCE);
      expect(Math.abs(r.bearingTrue - (legs[i]?.course ?? 0))).toBeLessThan(DEG_TOLERANCE);
    });
  });
});

describe('geodesicCircle', () => {
  it('closes a ring of points all the radius away, starting due north', () => {
    // Arrange
    const center = { lat: 35.5, lon: 139.8 };

    // Act
    const ring = geodesicCircle(center, 120, 96);

    // Assert
    expect(ring.length).toBe(97);
    expect(ring[96]?.lat).toBeCloseTo(ring[0]?.lat ?? 0, 12);
    expect(ring[96]?.lon).toBeCloseTo(ring[0]?.lon ?? 0, 12);
    expect(ring[0]?.lon).toBeCloseTo(center.lon, 12);
    expect(ring.every((p) => Math.abs(inverse(center, p).distanceNm - 120) < NM_TOLERANCE)).toBe(
      true,
    );
  });
});
