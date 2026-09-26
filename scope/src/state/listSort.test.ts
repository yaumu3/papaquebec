import { describe, expect, it } from 'bun:test';

import { distanceFromSite, sortTracks } from './listSort';
import type { Track } from './track';

function track(hex: string, over: Partial<Track> = {}): Track {
  return {
    hex,
    flight: undefined,
    squawk: undefined,
    category: undefined,
    alt: undefined,
    gs: undefined,
    track: undefined,
    baroRate: undefined,
    nic: undefined,
    nacP: undefined,
    messages: undefined,
    rssi: undefined,
    type: undefined,
    registration: undefined,
    description: undefined,
    emergency: undefined,
    tas: undefined,
    ias: undefined,
    mach: undefined,
    windSpeed: undefined,
    windDir: undefined,
    oat: undefined,
    tat: undefined,
    selAlt: undefined,
    fmsAlt: undefined,
    selHeading: undefined,
    navQnh: undefined,
    navModes: undefined,
    source: 'adsb',
    seen: 0,
    seenPos: 0,
    position: { kind: 'none' },
    history: [],
    ops: { hideTrail: false, pinnedCorner: null, autoCorner: 'ne' },
    ...over,
  };
}

describe('distanceFromSite', () => {
  it('is the plane distance of a drawable position and undefined otherwise', () => {
    // Arrange
    const cases = [
      track('a', { position: { kind: 'live', lat: 0, lon: 0, x: 3, y: 4 } }),
      track('b', { position: { kind: 'last', lat: 0, lon: 0, x: -6, y: 8 } }),
      track('c', { position: { kind: 'rr', lat: 0, lon: 0 } }),
    ];

    // Act
    const d = cases.map(distanceFromSite);

    // Assert
    expect(d).toEqual([5, 10, undefined]);
  });
});

describe('sortTracks', () => {
  it('sorts by identity label, registration counting as identity', () => {
    // Arrange
    const tracks = [
      track('c00001', { flight: 'JAL5' }),
      track('a00001', { registration: 'JA737T' }),
      track('b00001'),
    ];

    // Act
    const asc = sortTracks(tracks, { key: 'id', dir: 'asc' }).map((t) => t.hex);
    const desc = sortTracks(tracks, { key: 'id', dir: 'desc' }).map((t) => t.hex);

    // Assert
    expect(asc).toEqual(['b00001', 'a00001', 'c00001']);
    expect(desc).toEqual(['c00001', 'a00001', 'b00001']);
  });

  it('sorts numeric columns with unknown values last in either direction', () => {
    // Arrange
    const tracks = [
      track('a', { alt: 30000 }),
      track('b', { alt: undefined }),
      track('c', { alt: 'ground' }),
      track('d', { alt: 5000 }),
    ];

    // Act
    const asc = sortTracks(tracks, { key: 'alt', dir: 'asc' }).map((t) => t.hex);
    const desc = sortTracks(tracks, { key: 'alt', dir: 'desc' }).map((t) => t.hex);

    // Assert
    expect(asc).toEqual(['c', 'd', 'a', 'b']);
    expect(desc).toEqual(['a', 'd', 'c', 'b']);
  });

  it('sorts by distance from the site', () => {
    // Arrange
    const tracks = [
      track('far', { position: { kind: 'live', lat: 0, lon: 0, x: 30, y: 0 } }),
      track('none'),
      track('near', { position: { kind: 'live', lat: 0, lon: 0, x: 0, y: 2 } }),
    ];

    // Act
    const out = sortTracks(tracks, { key: 'dist', dir: 'asc' }).map((t) => t.hex);

    // Assert
    expect(out).toEqual(['near', 'far', 'none']);
  });

  it('does not mutate its input', () => {
    // Arrange
    const tracks = [track('b'), track('a')];

    // Act
    sortTracks(tracks, { key: 'id', dir: 'asc' });

    // Assert
    expect(tracks.map((t) => t.hex)).toEqual(['b', 'a']);
  });
});
