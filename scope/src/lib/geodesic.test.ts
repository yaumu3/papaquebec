import { describe, expect, it } from 'bun:test';

import { NM_IN_METERS } from './geo';
import { direct, geodesicCircle, geodesicPath, inverse } from './geodesic';

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

  it('splits a curving edge into pieces that lie on the geodesic, each within the tolerance', () => {
    // Arrange
    const a = { lat: 35, lon: 130 };
    const b = { lat: 35, lon: 150 };
    const tolerance = 0.001;

    // Act
    const path = geodesicPath([a, b], lonLat, tolerance);

    // Assert
    const whole = inverse(a, b).distanceNm;
    const inner = path.slice(1, -1).map((p) => ({ lat: p.y, lon: p.x }));
    expect(path[0]).toEqual(lonLat(a.lat, a.lon));
    expect(path.at(-1)).toEqual(lonLat(b.lat, b.lon));
    expect(inner.length).toBeGreaterThan(0);
    for (const p of inner) {
      expect(inverse(a, p).distanceNm + inverse(p, b).distanceNm - whole).toBeLessThan(
        NM_TOLERANCE,
      );
    }
    const bows = path.slice(1).map((q, i) => {
      const p = path[i] ?? q;
      const route = inverse({ lat: p.y, lon: p.x }, { lat: q.y, lon: q.x });
      const mid = direct({ lat: p.y, lon: p.x }, route.bearingTrue, route.distanceNm / 2);
      return Math.hypot(mid.lon - (p.x + q.x) / 2, mid.lat - (p.y + q.y) / 2);
    });
    expect(Math.max(...bows)).toBeLessThan(tolerance);
  });
});
