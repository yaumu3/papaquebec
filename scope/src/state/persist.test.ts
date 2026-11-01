import { describe, expect, it } from 'bun:test';

import { memoryStorage } from './memoryStorage';
import { loadPersisted, PERSIST_KEY, savePersisted, type Persisted } from './persist';
import { DEFAULT_SETTINGS, type Settings } from './settings';

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
    ];

    // Act
    const results = rows.map(([settings]) => loaded({ settings }).settings);

    // Assert
    expect(results).toEqual(rows.map(([, kept]) => Object.assign({}, DEFAULT_SETTINGS, kept)));
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

describe('savePersisted', () => {
  it('round-trips through storage, the exceptions in their order', () => {
    // Arrange
    const storage = memoryStorage();
    const state: Persisted = {
      settings: {
        ...DEFAULT_SETTINGS,
        rangeNm: 20,
        labelDensity: 'dense',
        exceptions: { fix: new Set(['z', 'a']), ctr: new Set(['q']) },
        openGroups: ['POINTS', 'AIRSPACE'],
        openLayers: ['fix'],
        disabledSets: ['openaip'],
      },
      panels: { ...DEFAULTS.panels, maps: false },
      listSort: { key: 'alt', dir: 'desc' },
      plotted: ['alt', 'gs', 'trk', 'ias', 'vs', 'roll'],
      ndRangeNm: 80,
    };
    savePersisted(storage, state);

    // Act
    const back = loadPersisted(storage, DEFAULTS);

    // Assert
    expect(back).toEqual(state);
    expect([...(back.settings.exceptions.fix ?? [])]).toEqual(['z', 'a']);
  });
});
