import { beforeEach, describe, expect, it } from 'bun:test';

import type { AircraftSnapshot } from '../lib/aircraft';
import { forgetHovered, hovered, setHovered } from './scope';
import { createTrackStore } from './trackStore';

const project = () => ({ x: 0, y: 0 });

const snapshot = (now: number, hexes: string[]): AircraftSnapshot => ({
  now,
  messages: 0,
  aircraft: hexes.map((hex) => ({
    hex,
    position: { lat: 35.5, lon: 139.8 },
    alt: 11000,
    heard: { messages: now, position: now },
  })),
});

describe('the hover', () => {
  beforeEach(() => {
    setHovered('scope', null);
    setHovered('list', null);
  });

  it('is replaced by a set from any surface', () => {
    // Arrange
    const sets = [
      ['list', 'd00001'],
      ['nd', 'd00002'],
      ['scope', 'd00003'],
    ] as const;

    // Act
    const seen = sets.map(([by, hex]) => {
      setHovered(by, hex);
      return hovered();
    });

    // Assert
    expect(seen).toEqual(['d00001', 'd00002', 'd00003']);
  });

  it('is cleared only by the surface that set it', () => {
    // Arrange
    setHovered('list', 'd00001');
    const clears = ['scope', 'nd', 'list'] as const;

    // Act
    const seen = clears.map((by) => {
      setHovered(by, null);
      return hovered();
    });

    // Assert
    expect(seen).toEqual(['d00001', 'd00001', null]);
  });

  it('is forgotten once its aircraft has left the track store', () => {
    // Arrange
    const cases = [
      { later: ['d00001', 'd00002'], expected: 'd00001' },
      { later: ['d00002'], expected: null },
    ];
    const results = cases.map(({ later }) => {
      const store = createTrackStore(project);
      store.ingest(snapshot(1000, ['d00001', 'd00002']));
      setHovered('list', 'd00001');
      store.ingest(snapshot(1001, later));
      return store.tracks;
    });

    // Act
    const seen = results.map((tracks) => {
      forgetHovered(tracks);
      return hovered();
    });

    // Assert
    expect(seen).toEqual(cases.map((c) => c.expected));
  });
});
