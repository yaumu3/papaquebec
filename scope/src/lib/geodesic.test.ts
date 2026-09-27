import { describe, expect, it } from 'bun:test';

import { NM_IN_METERS } from './geo';
import { inverse } from './geodesic';

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
