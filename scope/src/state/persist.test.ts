import { describe, expect, it } from 'bun:test';

import { DRAW_STACK } from '../lib/layers';
import { memoryStorage } from './memoryStorage';
import { loadPersisted, PERSIST_KEY, savePersisted, type Persisted } from './persist';
import { DEFAULT_SETTINGS, type ListSort, type ShownLayers } from './settings';

const DEFAULT_PANELS = { display: true, maps: true, list: true, detail: true };
const DEFAULT_SORT: ListSort = { key: 'id', dir: 'asc' };
const DEFAULTS: Persisted = {
  settings: DEFAULT_SETTINGS,
  panels: DEFAULT_PANELS,
  listSort: DEFAULT_SORT,
  plotted: ['pfd', 'nd', 'alt'],
  ndRangeNm: 20,
};

describe('loadPersisted', () => {
  it('returns defaults when nothing is stored or the entry is unreadable', () => {
    // Arrange
    const empty = memoryStorage();
    const broken = memoryStorage({ [PERSIST_KEY]: '{not json' });

    // Act
    const a = loadPersisted(empty, DEFAULTS);
    const b = loadPersisted(broken, DEFAULTS);

    // Assert
    expect(a).toEqual(DEFAULTS);
    expect(b).toEqual(DEFAULTS);
  });

  it('accepts valid fields and falls back per field on invalid ones', () => {
    // Arrange
    const stored = {
      settings: {
        rangeNm: 55,
        vectorMin: 99,
        trailSec: 120,
        filter: { lowerFl: 100, upperFl: 50, squawk: 'nonvfr' },
        shownLayers: { coast: false, ctr: 'yes' },
        labelDensity: 'loud',
        altimeter: { transitionAltFt: 5000, qnhInHg: 99 },
      },
      panels: { list: false, detail: 'no' },
      listSort: { key: 'dist', dir: 'sideways' },
    };
    const storage = memoryStorage({ [PERSIST_KEY]: JSON.stringify(stored) });

    // Act
    const { settings, panels, listSort } = loadPersisted(storage, DEFAULTS);

    // Assert
    expect(settings.rangeNm).toBe(55);
    expect(settings.vectorMin).toBe(DEFAULT_SETTINGS.vectorMin);
    expect(settings.trailSec).toBe(120);
    expect(settings.filter).toEqual({ ...DEFAULT_SETTINGS.filter, squawk: 'nonvfr' });
    expect(settings.shownLayers).toEqual({ ...DEFAULT_SETTINGS.shownLayers, coast: false });
    expect(settings.labelDensity).toBe(DEFAULT_SETTINGS.labelDensity);
    expect(settings.altimeter).toEqual({ ...DEFAULT_SETTINGS.altimeter, transitionAltFt: 5000 });
    expect(panels).toEqual({ ...DEFAULT_PANELS, list: false });
    expect(listSort).toEqual({ key: 'dist', dir: 'asc' });
  });
});

describe('loadPersisted layers', () => {
  const HIDDEN: string[] = [
    'adiz',
    'cta',
    'advisory',
    'asr',
    'tra',
    'civt',
    'dct',
    'sid',
    'star',
    'trans',
    'vfr',
    'hold',
  ];

  it('hides exactly the twelve layers the spec hides, until they are shown', () => {
    // Arrange
    const shown = DEFAULT_SETTINGS.shownLayers;

    // Act
    const hidden: string[] = DRAW_STACK.filter((layer) => !shown[layer]);

    // Assert
    expect(hidden.toSorted()).toEqual(HIDDEN.toSorted());
  });

  it('reads the saved flags, and from the old ones only the coast and the rings', () => {
    // Arrange
    const D = DEFAULT_SETTINGS.shownLayers;
    const rows: { name: string; stored: object; expected: ShownLayers }[] = [
      {
        name: 'old flags: sector off, coast and rings off',
        stored: { layers: { sector: false, coast: false, rings: false } },
        expected: { ...D, coast: false, rings: false },
      },
      {
        name: 'old flags reach no new layer',
        stored: { layers: { airspace: false, waypoints: false, airways: true, navaids: false } },
        expected: { ...D },
      },
      {
        name: 'saved flags win over the old coast',
        stored: { shownLayers: { sector: false, ctr: false }, layers: { coast: false } },
        expected: { ...D, sector: false, ctr: false },
      },
      {
        name: 'junk falls back per key',
        stored: { shownLayers: { ctr: 'yes', fir: 1, bogus: false, vfr: true } },
        expected: { ...D, vfr: true },
      },
      {
        name: 'junk old flags fall back',
        stored: { layers: { coast: 'no', rings: 0 } },
        expected: { ...D },
      },
    ];

    // Act
    const loaded = rows.map(({ stored }) =>
      loadPersisted(
        memoryStorage({ [PERSIST_KEY]: JSON.stringify({ settings: stored }) }),
        DEFAULTS,
      ),
    );

    // Assert
    expect(loaded.map((p) => p.settings.shownLayers)).toEqual(rows.map((r) => r.expected));
  });
});

describe('savePersisted', () => {
  it('round-trips through storage', () => {
    // Arrange
    const storage = memoryStorage();
    const state: Persisted = {
      settings: { ...DEFAULT_SETTINGS, rangeNm: 20, labelDensity: 'dense' },
      panels: { ...DEFAULT_PANELS, maps: false },
      listSort: { key: 'alt', dir: 'desc' },
      plotted: ['trk', 'gs'],
      ndRangeNm: 80,
    };
    savePersisted(storage, state);

    // Act
    const back = loadPersisted(storage, DEFAULTS);

    // Assert
    expect(back).toEqual(state);
  });

  it('rejects ranges outside the zoom limits', () => {
    // Arrange
    const storage = memoryStorage({
      [PERSIST_KEY]: JSON.stringify({ settings: { rangeNm: 3 } }),
    });

    // Act
    const { settings } = loadPersisted(storage, DEFAULTS);

    // Assert
    expect(settings.rangeNm).toBe(DEFAULT_SETTINGS.rangeNm);
  });
});

describe('loadPersisted qnh', () => {
  it('keeps a valid station and auto flag and falls back field by field otherwise', () => {
    // Arrange
    const good = memoryStorage({
      [PERSIST_KEY]: JSON.stringify({ settings: { qnh: { auto: false, station: 'RJAA' } } }),
    });
    const bad = memoryStorage({
      [PERSIST_KEY]: JSON.stringify({ settings: { qnh: { auto: 'yes', station: 'narita' } } }),
    });

    // Act
    const a = loadPersisted(good, DEFAULTS).settings.qnh;
    const b = loadPersisted(bad, DEFAULTS).settings.qnh;

    // Assert
    expect(a).toEqual({ auto: false, station: 'RJAA' });
    expect(b).toEqual(DEFAULT_SETTINGS.qnh);
  });
});

describe('loadPersisted filter', () => {
  it('keeps a stored ground switch and falls back when it is missing or malformed', () => {
    // Arrange
    const stores = [{ ground: false }, {}, { ground: 'no' }].map((filter) =>
      memoryStorage({ [PERSIST_KEY]: JSON.stringify({ settings: { filter } }) }),
    );

    // Act
    const grounds = stores.map((s) => loadPersisted(s, DEFAULTS).settings.filter.ground);

    // Assert
    expect(grounds).toEqual([false, true, true]);
  });
});

describe('loadPersisted band', () => {
  it('falls back to the default band when a saved upper edge is past the top stop', () => {
    // Arrange
    const storage = memoryStorage({
      [PERSIST_KEY]: JSON.stringify({ settings: { filter: { lowerFl: 100, upperFl: 600 } } }),
    });
    const { lowerFl, upperFl } = DEFAULTS.settings.filter;

    // Act
    const { filter } = loadPersisted(storage, DEFAULTS).settings;

    // Assert
    expect([filter.lowerFl, filter.upperFl]).toEqual([lowerFl, upperFl]);
  });
});

describe('loadPersisted plotted', () => {
  it('keeps the lanes it knows, each once, and falls back when the entry is no list', () => {
    // Arrange
    const stores = [['gs', 'bogus', 'alt', 'gs'], [], 'alt'].map((plotted) =>
      memoryStorage({ [PERSIST_KEY]: JSON.stringify({ plotted }) }),
    );

    // Act
    const plotted = stores.map((s) => loadPersisted(s, DEFAULTS).plotted);

    // Assert
    expect(plotted).toEqual([['gs', 'alt'], [], ['pfd', 'nd', 'alt']]);
  });
});

describe('loadPersisted plotted lanes', () => {
  it('keeps every lane of a stored plot, however many', () => {
    // Arrange
    const storage = memoryStorage({
      [PERSIST_KEY]: JSON.stringify({ plotted: ['alt', 'gs', 'trk', 'ias', 'vs', 'roll'] }),
    });

    // Act
    const { plotted } = loadPersisted(storage, DEFAULTS);

    // Assert
    expect(plotted).toEqual(['alt', 'gs', 'trk', 'ias', 'vs', 'roll']);
  });
});

describe('loadPersisted ndRangeNm', () => {
  it('keeps a range of the scale, and falls back for any other value', () => {
    // Arrange
    const stores = [40, 30, '40', null, undefined].map((ndRangeNm) =>
      memoryStorage({ [PERSIST_KEY]: JSON.stringify({ ndRangeNm }) }),
    );

    // Act
    const ranges = stores.map((st) => loadPersisted(st, DEFAULTS).ndRangeNm);

    // Assert
    expect(ranges).toEqual([40, 20, 20, 20, 20]);
  });
});
