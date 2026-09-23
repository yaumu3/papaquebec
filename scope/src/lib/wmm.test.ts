import { describe, expect, it } from 'bun:test';

import { magneticDeclination } from './wmm';

describe('magneticDeclination (WMM2025)', () => {
  it('matches the NOAA WMM2025 test values to 0.01 degree', () => {
    // Arrange
    // Rows from WMM2025_TEST_VALUES.txt: [decimal year, height km, lat, lon, declination]
    const cases: [number, number, number, number, number][] = [
      [2025.0, 0, 80, 0, 1.28],
      [2025.0, 0, 0, 120, -0.16],
      [2025.0, 0, -80, 240, 68.78],
      [2025.0, 100, 80, 0, 0.85],
      [2025.0, 100, 0, 120, -0.15],
      [2025.0, 100, -80, 240, 68.21],
      [2027.5, 0, 80, 0, 2.59],
      [2027.5, 0, 0, 120, -0.24],
      [2027.5, 0, -80, 240, 68.49],
      [2027.5, 100, 80, 0, 2.16],
      [2027.5, 100, 0, 120, -0.23],
    ];

    // Act
    const results = cases.map(([year, hKm, lat, lon]) => magneticDeclination(lat, lon, hKm, year));

    // Assert
    results.forEach((d, i) => {
      expect(d).toBeCloseTo(cases[i]?.[4] ?? NaN, 2);
    });
  });

  it('reports west declination as negative for Fukuoka', () => {
    // Arrange
    const lat = 33.5844;
    const lon = 130.4517;

    // Act
    const d = magneticDeclination(lat, lon, 0, 2026.7);

    // Assert
    expect(d).toBeLessThan(-6.5);
    expect(d).toBeGreaterThan(-9);
  });
});
