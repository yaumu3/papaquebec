import { describe, expect, it } from 'bun:test';

import { parseTrace } from './trace';

describe('parseTrace', () => {
  it('turns readsb trace rows into timed positions, skipping rows without a position', () => {
    // Arrange
    const raw = {
      icao: '8514b4',
      timestamp: 1_700_000_000,
      trace: [
        // near RJAA, tracking east
        [0, 35.7, 140.3, 5000, 250, 90, 0, -500, null, 'adsb_icao', 5200, 240, 0],
        [4.5, 35.71, 140.32, 'ground', 20, 95, 2, 0, null, 'adsb_icao'],
        [9, null, null, 6000, 250, 90, 0, 0, null, 'adsb_icao'],
        [12, 35.72, 140.34, null, 250, 90, 0, 0, null, 'adsb_icao'],
      ],
    };

    // Act
    const trace = parseTrace(raw);

    // Assert
    expect(trace?.hex).toBe('8514b4');
    expect(trace?.points).toEqual([
      { t: 1_700_000_000, lat: 35.7, lon: 140.3, alt: 5000 },
      { t: 1_700_000_004.5, lat: 35.71, lon: 140.32, alt: 'ground' },
      { t: 1_700_000_012, lat: 35.72, lon: 140.34, alt: undefined },
    ]);
  });

  it('returns null for anything that is not a trace file', () => {
    // Arrange
    const bad: unknown[] = [
      null,
      {},
      { icao: 'x', timestamp: 'y', trace: [] },
      { icao: 'x', timestamp: 1, trace: 'z' },
    ];

    // Act
    const out = bad.map(parseTrace);

    // Assert
    expect(out).toEqual([null, null, null, null]);
  });
});
