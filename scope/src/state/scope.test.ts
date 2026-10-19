import { beforeEach, describe, expect, it } from 'bun:test';

import type { AircraftSnapshot } from '../lib/aircraft';
import { makeTrack } from '../render/scene/trackFixture';
import { sortTracks } from './listSort';
import { forgetHovered, hexAt, hovered, hoverMark, setHovered, setSelected } from './scope';
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
    setSelected(null);
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

  it('follows the place under a resting pointer as the list re-sorts', () => {
    // Arrange
    const sort = { key: 'alt', dir: 'asc' } as const;
    const before = [
      makeTrack({ hex: 'd00001', alt: 1000 }),
      makeTrack({ hex: 'd00002', alt: 2000 }),
    ];
    const after = [
      makeTrack({ hex: 'd00001', alt: 3000 }),
      makeTrack({ hex: 'd00002', alt: 2000 }),
    ];
    const hexes = (tracks: typeof before) => sortTracks(tracks, sort).map((t) => t.hex);

    // Act
    const seen = [before, after].map((tracks) => hexAt(hexes(tracks), 0));

    // Assert
    expect(seen).toEqual(['d00001', 'd00002']);
  });

  it('hovers nothing from no place or one past the last', () => {
    // Arrange
    const places = [null, 2];

    // Act
    const seen = places.map((place) => hexAt(['d00001', 'd00002'], place));

    // Assert
    expect(seen).toEqual([null, null]);
  });

  it('marks the hovered aircraft unless it is the selected one', () => {
    // Arrange
    setHovered('list', 'd00001');
    const selections = [null, 'd00002', 'd00001'];

    // Act
    const marks = selections.map((hex) => {
      setSelected(hex);
      return hoverMark();
    });

    // Assert
    expect(marks).toEqual(['d00001', 'd00001', null]);
  });
});
