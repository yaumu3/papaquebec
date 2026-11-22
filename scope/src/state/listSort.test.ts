import { afterEach, describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { distanceFromSite, sortTracks, stepThrough } from './listSort';
import { setDeclinationAt } from './magnetic';
import { resetDeclination } from './sampleFixture';
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
    heading: undefined,
    verticalRate: undefined,
    roll: undefined,
    trackRate: undefined,
    nic: undefined,
    rc: undefined,
    nacP: undefined,
    messageRate: undefined,
    messages: undefined,
    rssi: undefined,
    type: undefined,
    registration: undefined,
    description: undefined,
    emergency: undefined,
    ident: false,
    ra: undefined,
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
    heard: {},
    at: undefined,
    position: { kind: 'none' },
    history: [],
    samples: [],
    ops: { dir: null, movedAt: null, manual: false },
    ...over,
  };
}

describe('distanceFromSite', () => {
  it('is the plane distance of a drawable position and undefined otherwise', () => {
    // Arrange
    const cases = [
      track('a', { position: { kind: 'live', lat: 0, lon: 0, x: 3, y: 4 } }),
      track('b', { position: { kind: 'none' } }),
    ];

    // Act
    const d = cases.map(distanceFromSite);

    // Assert
    expect(d).toEqual([5, undefined]);
  });
});

describe('sortTracks', () => {
  afterEach(resetDeclination);

  it('sorts by identity label, registration counting as identity', () => {
    // Arrange
    const tracks = [
      track('d0000c', { flight: 'TEST04' }),
      track('d0000a', { registration: 'TEST-02' }),
      track('d0000b'),
    ];

    // Act
    const asc = sortTracks(tracks, { key: 'id', dir: 'asc' }).map((t) => t.hex);
    const desc = sortTracks(tracks, { key: 'id', dir: 'desc' }).map((t) => t.hex);

    // Assert
    expect(asc).toEqual(['d0000b', 'd0000a', 'd0000c']);
    expect(desc).toEqual(['d0000c', 'd0000a', 'd0000b']);
  });

  it('orders a numeric column either way, ties and unknown values in the order they came, the unknown last', () => {
    // Arrange: few distinct values, so that ties are common
    const anyReadings = fc.record({
      alt: fc.constantFrom(undefined, 'ground' as const, 0, 5000, 30_000),
      gs: fc.constantFrom(undefined, 0, 250, 460),
      position: fc.oneof(
        fc.constant<Track['position']>({ kind: 'none' }),
        fc.record({
          kind: fc.constant('live' as const),
          lat: fc.constant(0),
          lon: fc.constant(0),
          x: fc.integer({ min: -2, max: 2 }),
          y: fc.integer({ min: -2, max: 2 }),
        }),
      ),
    });
    const anyTracks = fc
      .array(anyReadings)
      .map((rows) => rows.map((readings, place) => track(`d${place}`, readings)));
    /** What each column orders by, a target on the ground below any altitude. */
    const columns = {
      alt: (t: Track) => (t.alt === 'ground' ? -Infinity : t.alt),
      gs: (t: Track) => t.gs,
      dist: distanceFromSite,
    };
    const anySort = fc.record({
      key: fc.constantFrom('alt' as const, 'gs' as const, 'dist' as const),
      dir: fc.constantFrom('asc' as const, 'desc' as const),
    });

    fc.assert(
      fc.property(anyTracks, anySort, (tracks, sort) => {
        // Arrange
        const came = [...tracks];

        // Act
        const sorted = sortTracks(tracks, sort);

        // Assert
        const value = columns[sort.key];
        const inOrder = (a: Track, b: Track): boolean => {
          const [va, vb] = [value(a), value(b)];
          if (va === undefined || vb === undefined) return va === vb || vb === undefined;
          return sort.dir === 'asc' ? va <= vb : va >= vb;
        };
        const pairs = sorted.slice(1).map((next, k) => [sorted[k] ?? next, next] as const);
        expect(tracks).toEqual(came);
        expect(sorted.toSorted((a, b) => came.indexOf(a) - came.indexOf(b))).toEqual(came);
        expect(pairs.filter(([a, b]) => !inOrder(a, b))).toEqual([]);
        expect(
          pairs.filter(([a, b]) => value(a) === value(b) && came.indexOf(a) > came.indexOf(b)),
        ).toEqual([]);
      }),
    );
  });

  it('sorts by magnetic track, as the column reads', () => {
    // Arrange
    setDeclinationAt(() => () => -8);
    const at = { lat: 33.6, lon: 130.5 };
    const tracks = [track('east', { track: 10, at }), track('north', { track: 355, at })];

    // Act
    const out = sortTracks(tracks, { key: 'track', dir: 'asc' }).map((t) => t.hex);

    // Assert
    expect(out).toEqual(['north', 'east']);
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

describe('stepThrough', () => {
  it('steps through every row in turn and round from either end to the other, back to where it began', () => {
    // Arrange
    const anyList = fc
      .uniqueArray(fc.string(), { minLength: 1, maxLength: 8 })
      .chain((hexes) => fc.record({ hexes: fc.constant(hexes), from: fc.nat(hexes.length - 1) }));
    const anyDirection = fc.constantFrom<1 | -1>(1, -1);

    fc.assert(
      fc.property(anyList, anyDirection, ({ hexes, from }, direction) => {
        // Arrange
        const walk: (string | null)[] = [];
        let current = hexes[from] ?? null;

        // Act
        for (let step = 0; step < hexes.length; step++) {
          current = stepThrough(hexes, current, direction);
          walk.push(current);
        }

        // Assert
        const down = [...hexes.slice(from + 1), ...hexes.slice(0, from + 1)];
        const up = [...hexes.slice(0, from).toReversed(), ...hexes.slice(from).toReversed()];
        expect(walk).toEqual(direction === 1 ? down : up);
      }),
    );
  });

  it('enters at the top going down and at the bottom going up, from no row or one no longer listed, and nowhere in an empty list', () => {
    // Arrange
    const hexes = ['a', 'b', 'c'];
    const steps: [readonly string[], string | null, 1 | -1][] = [
      [hexes, null, 1],
      [hexes, 'gone', -1],
      [[], 'a', 1],
    ];

    // Act
    const out = steps.map(([list, current, direction]) => stepThrough(list, current, direction));

    // Assert
    expect(out).toEqual(['a', 'c', null]);
  });
});
