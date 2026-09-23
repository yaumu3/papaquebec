import { describe, expect, it } from 'bun:test';

import { chunkToSnapshots, parseChunkIndex } from './chunks';

describe('parseChunkIndex', () => {
  it('lists the chunk files tar1090 would load', () => {
    // Arrange
    const raw = { chunks: ['chunk_1.gz', 'current_large.gz', 7], chunks_all: ['x'] };

    // Act
    const files = parseChunkIndex(raw);

    // Assert
    expect(files).toEqual(['chunk_1.gz', 'current_large.gz']);
  });

  it('is empty for anything else', () => {
    // Arrange
    const bad: unknown[] = [null, {}, { chunks: 'nope' }];

    // Act
    const out = bad.map(parseChunkIndex);

    // Assert
    expect(out).toEqual([[], [], []]);
  });
});

describe('chunkToSnapshots', () => {
  it('expands compact history records into aircraft.json snapshots', () => {
    // Arrange
    const raw = {
      files: [
        {
          now: 1000.5,
          messages: 42,
          aircraft: [
            ['8514b4', 33250, 450, 92.1, 36.9, 139.0, 1.7, 'adsb_icao', 'JAL123 ', 9], // Nikko
            ['abc123', 'ground', null, null, 35.7, 140.3, 0.2, 'mlat', null, 3], // near RJAA
            ['def456', 5000, 200, 10, 35.8, 140.4, 0.5, 'tisb_icao', null, 1], // near RJAA
            ['bad'],
          ],
        },
        { now: 999, messages: 40, aircraft: [] },
      ],
    };

    // Act
    const snaps = chunkToSnapshots(raw);

    // Assert
    expect(snaps.map((s) => s.now)).toEqual([1000.5, 999]);
    expect(snaps[0]?.aircraft).toEqual([
      {
        hex: '8514b4',
        alt_baro: 33250,
        gs: 450,
        track: 92.1,
        lat: 36.9,
        lon: 139.0,
        seen: 1.7,
        seen_pos: 1.7,
        flight: 'JAL123 ',
        messages: 9,
      },
      {
        hex: 'abc123',
        alt_baro: 'ground',
        lat: 35.7,
        lon: 140.3,
        seen: 0.2,
        seen_pos: 0.2,
        messages: 3,
        mlat: ['lat', 'lon'],
      },
      {
        hex: 'def456',
        alt_baro: 5000,
        gs: 200,
        track: 10,
        lat: 35.8,
        lon: 140.4,
        seen: 0.5,
        seen_pos: 0.5,
        messages: 1,
        tisb: ['lat', 'lon'],
      },
    ]);
  });
});
