import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { DRAW_STACK, LABEL_DENSITIES, LAYER_GROUPS } from '../lib/layers';
import { FL_MAX, FL_MIN, type SquawkFilter } from './filter';
import { memoryStorage } from './memoryStorage';
import { loadPersisted, PERSIST_KEY, savePersisted, type Persisted } from './persist';
import { LANE_KEYS } from './plotted';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import {
  type Exceptions,
  INFO_PAGES,
  type InfoPage,
  ND_RANGES_NM,
  QNH_MAX_INHG,
  QNH_MIN_INHG,
  RANGE_MAX_NM,
  RANGE_MIN_NM,
  SORT_DIRS,
  SORT_KEYS,
  STATION_RE,
  TRAIL_STEPS,
  TRANSITION_ALT_MAX_FT,
  VECTOR_STEPS,
} from './settingsDefaults';

const DEFAULTS: Persisted = {
  settings: DEFAULT_SETTINGS,
  panels: { display: true, maps: true, list: true, detail: true },
  listSort: { key: 'id', dir: 'asc' },
  plotted: ['pfd', 'nd', 'alt'],
  ndRangeNm: 20,
};

const loaded = (stored: unknown) =>
  loadPersisted(memoryStorage({ [PERSIST_KEY]: JSON.stringify(stored) }), DEFAULTS);

const { filter, altimeter, shownLayers, qnh } = DEFAULT_SETTINGS;

describe('loadPersisted', () => {
  it('returns defaults when nothing is stored or the entry is unreadable', () => {
    // Arrange
    const stores = [memoryStorage(), memoryStorage({ [PERSIST_KEY]: '{not json' })];

    // Act
    const results = stores.map((storage) => loadPersisted(storage, DEFAULTS));

    // Assert
    expect(results).toEqual([DEFAULTS, DEFAULTS]);
  });

  it('falls back to the default for junk in a field of the settings, and keeps the rest', () => {
    // Arrange
    const rows: [Record<string, unknown>, Partial<Settings>][] = [
      [{ rangeNm: 3 }, {}],
      [{ rangeNm: 401 }, {}],
      [{ vectorMin: 99 }, {}],
      [{ trailSec: 'long' }, {}],
      [{ labelDensity: 'loud' }, {}],
      [
        { altimeter: { transitionAltFt: 5000, qnhInHg: 99 } },
        { altimeter: { ...altimeter, transitionAltFt: 5000 } },
      ],
      [{ altimeter: 'high' }, {}],
      [{ filter: { ground: 'no', squawk: 'nonvfr' } }, { filter: { ...filter, squawk: 'nonvfr' } }],
      [{ filter: { ground: false, squawk: 'loud' } }, { filter: { ...filter, ground: false } }],
      [{ qnh: { auto: 'yes', station: 'narita' } }, {}],
      [
        { qnh: { auto: false, station: 'RJAA' } },
        { qnh: { ...qnh, auto: false, station: 'RJAA' } },
      ],
      [
        { shownLayers: { ctr: 'yes', fir: 1, bogus: false, vfr: true } },
        { shownLayers: { ...shownLayers, vfr: true } },
      ],
      [{ shownLayers: 'all' }, {}],
      [{ exceptions: 'fix' }, {}],
      [{ exceptions: { fix: 'a' } }, {}],
      [{ exceptions: { fix: ['a', 3, null, 'b'] } }, { exceptions: { fix: new Set(['a', 'b']) } }],
      [{ exceptions: { nowhere: ['a'], ctr: ['b'] } }, { exceptions: { ctr: new Set(['b']) } }],
      [{ openGroups: ['AIRSPACE', 'NOWHERE', 7] }, { openGroups: ['AIRSPACE'] }],
      [{ openGroups: 'AIRSPACE' }, {}],
      [{ openLayers: ['fix', 'nowhere', 7] }, { openLayers: ['fix'] }],
      [{ openLayers: { fix: true } }, {}],
      [{ disabledSets: ['openaip', 'my-fixes'] }, { disabledSets: ['openaip', 'my-fixes'] }],
      [{ disabledSets: ['openaip', 7] }, {}],
      [{ disabledSets: 'openaip' }, {}],
      [{ infoPage: 'clock' }, {}],
      [{ infoPage: 3 }, {}],
    ];

    // Act
    const results = rows.map(([settings]) => loaded({ settings }).settings);

    // Assert
    expect(results).toEqual(rows.map(([, kept]) => Object.assign({}, DEFAULT_SETTINGS, kept)));
  });

  it('keeps a saved info block page, and takes QNH when the key is missing', () => {
    // Arrange
    const rows: [Record<string, unknown>, InfoPage][] = [
      [{}, 'qnh'],
      [{ infoPage: 'qnh' }, 'qnh'],
      [{ infoPage: 'tracks' }, 'tracks'],
      [{ infoPage: 'rate' }, 'rate'],
    ];

    // Act
    const pages = rows.map(([settings]) => loaded({ settings }).settings.infoPage);

    // Assert
    expect(pages).toEqual(rows.map(([, page]) => page));
  });

  it('takes both edges of the band from the default when the two make no band', () => {
    // Arrange
    const bands = [
      { lowerFl: 100, upperFl: 600 },
      { lowerFl: 300, upperFl: 100 },
      { lowerFl: -5, upperFl: 100 },
    ];

    // Act
    const edges = bands.map((band) => {
      const { lowerFl, upperFl } = loaded({ settings: { filter: band } }).settings.filter;
      return [lowerFl, upperFl];
    });

    // Assert
    expect(edges).toEqual(bands.map(() => [filter.lowerFl, filter.upperFl]));
  });

  it('falls back to the default for junk outside the settings', () => {
    // Arrange
    const rows: [Partial<Record<keyof Persisted, unknown>>, Partial<Persisted>][] = [
      [{ panels: { list: false, detail: 'no' } }, { panels: { ...DEFAULTS.panels, list: false } }],
      [{ panels: 'none' }, {}],
      [{ listSort: { key: 'dist', dir: 'sideways' } }, { listSort: { key: 'dist', dir: 'asc' } }],
      [{ plotted: ['gs', 'bogus', 'alt', 'gs'] }, { plotted: ['gs', 'alt'] }],
      [{ plotted: [] }, { plotted: [] }],
      [{ plotted: 'alt' }, {}],
      [{ ndRangeNm: 40 }, { ndRangeNm: 40 }],
      [{ ndRangeNm: 30 }, {}],
      [{ ndRangeNm: '40' }, {}],
    ];

    // Act
    const results = rows.map(([stored]) => loaded(stored));

    // Assert
    expect(results).toEqual(rows.map(([, kept]) => Object.assign({}, DEFAULTS, kept)));
  });
});

/** The exceptions of each layer as a list, which tells their order as a set does not. */
const inOrder = (kept: Exceptions) =>
  Object.fromEntries(Object.entries(kept).map(([layer, keys]) => [layer, [...keys]]));

describe('savePersisted', () => {
  it('round-trips through storage whatever is set, the exceptions in their order', () => {
    // Arrange
    const anyFilter = fc
      .record({
        ground: fc.boolean(),
        squawk: fc.constantFrom<SquawkFilter>('all', 'nonvfr', 'emergency'),
        lowerFl: fc.integer({ min: FL_MIN, max: FL_MAX - 1 }),
        width: fc.integer({ min: 1, max: FL_MAX }),
      })
      .map(({ ground, squawk, lowerFl, width }) => ({
        ground,
        squawk,
        lowerFl,
        upperFl: Math.min(FL_MAX, lowerFl + width),
      }));
    const anyKeys = fc.uniqueArray(fc.string()).map((keys) => new Set(keys));
    const anyExceptions = fc
      .subarray([...DRAW_STACK])
      .chain((layers) => fc.tuple(...layers.map((layer) => fc.tuple(fc.constant(layer), anyKeys))))
      .map((entries): Exceptions => Object.fromEntries(entries));
    const anyShownLayers = fc
      .tuple(...DRAW_STACK.map((layer) => fc.tuple(fc.constant(layer), fc.boolean())))
      .map((entries) => Object.assign({}, shownLayers, Object.fromEntries(entries)));
    // The open rows are read back in the order the tree lists them.
    const anySettings = fc.record<Settings>({
      rangeNm: fc.double({ min: RANGE_MIN_NM, max: RANGE_MAX_NM, noNaN: true }),
      vectorMin: fc.constantFrom(...VECTOR_STEPS),
      trailSec: fc.constantFrom(...TRAIL_STEPS),
      filter: anyFilter,
      shownLayers: anyShownLayers,
      exceptions: anyExceptions,
      disabledSets: fc.array(fc.string()),
      openGroups: fc.subarray(LAYER_GROUPS.map((group) => group.title)),
      openLayers: fc.subarray<string>([...DRAW_STACK]),
      labelDensity: fc.constantFrom(...LABEL_DENSITIES),
      altimeter: fc.record({
        transitionAltFt: fc.integer({ min: 0, max: TRANSITION_ALT_MAX_FT }),
        qnhInHg: fc.double({ min: QNH_MIN_INHG, max: QNH_MAX_INHG, noNaN: true }),
      }),
      qnh: fc.record({
        auto: fc.boolean(),
        station: fc.oneof(fc.constant(''), fc.stringMatching(STATION_RE)),
      }),
      infoPage: fc.constantFrom(...INFO_PAGES),
    });
    const anyState = fc.record<Persisted>({
      settings: anySettings,
      panels: fc.record({
        display: fc.boolean(),
        maps: fc.boolean(),
        list: fc.boolean(),
        detail: fc.boolean(),
      }),
      listSort: fc.record({
        key: fc.constantFrom(...SORT_KEYS),
        dir: fc.constantFrom(...SORT_DIRS),
      }),
      plotted: fc.uniqueArray(fc.constantFrom(...LANE_KEYS)),
      ndRangeNm: fc.constantFrom(...ND_RANGES_NM),
    });

    fc.assert(
      fc.property(anyState, (state) => {
        // Arrange
        const storage = memoryStorage();
        savePersisted(storage, state);

        // Act
        const back = loadPersisted(storage, DEFAULTS);

        // Assert
        expect(back).toEqual(state);
        expect(inOrder(back.settings.exceptions)).toEqual(inOrder(state.settings.exceptions));
      }),
    );
  });
});
