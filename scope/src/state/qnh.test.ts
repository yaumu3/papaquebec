import { describe, expect, it } from 'bun:test';

import type { StationReport } from '../lib/metar';
import { reportFor } from './qnh';

const observedAt = Date.parse('2026-10-13T11:00:00Z');
const haneda: StationReport = {
  station: 'RJTT',
  lat: 35.553,
  lon: 139.781,
  observedAt,
  qnhInHg: 29.91,
};
const narita: StationReport = {
  station: 'RJAA',
  lat: 35.765,
  lon: 140.386,
  observedAt,
  qnhInHg: 29.94,
};
const reports = [narita, haneda];
/** Between the two, nearer Narita. */
const site = { lat: 35.7, lon: 140.2 };

describe('reportFor', () => {
  it("gives the chosen station's report, or none when it does not report", () => {
    // Arrange
    const stations = ['RJTT', 'RJFF'];

    // Act
    const out = stations.map((station) => reportFor(station, site, reports));

    // Assert
    expect(out).toEqual([haneda, null]);
  });

  it('gives the report nearest the site when no station is chosen', () => {
    // Arrange
    const station = '';

    // Act
    const out = reportFor(station, site, reports);

    // Assert
    expect(out).toEqual(narita);
  });

  it('gives none without a site to be near, or without reports', () => {
    // Arrange
    const cases: [typeof site | null, StationReport[]][] = [
      [null, reports],
      [site, []],
    ];

    // Act
    const out = cases.map(([at, around]) => reportFor('', at, around));

    // Assert
    expect(out).toEqual([null, null]);
  });
});
