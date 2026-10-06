import { describe, expect, it } from 'bun:test';

import { FL_MAX } from './filter';
import type { ListSort } from './listSort';
import { memoryStorage } from './memoryStorage';
import { loadPersisted, PERSIST_KEY, savePersisted, type Persisted } from './persist';
import { DEFAULT_SETTINGS } from './settings';

const DEFAULT_PANELS = { display: true, maps: true, list: true, detail: true };
const DEFAULT_SORT: ListSort = { key: 'id', dir: 'asc' };
const DEFAULTS: Persisted = {
  settings: DEFAULT_SETTINGS,
  panels: DEFAULT_PANELS,
  listSort: DEFAULT_SORT,
  plotted: ['alt', 'gs'],
  historyOpen: true,
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
        layers: { coast: false, airspace: 'yes' },
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
    expect(settings.layers).toEqual({ ...DEFAULT_SETTINGS.layers, coast: false });
    expect(settings.labelDensity).toBe(DEFAULT_SETTINGS.labelDensity);
    expect(settings.altimeter).toEqual({ ...DEFAULT_SETTINGS.altimeter, transitionAltFt: 5000 });
    expect(panels).toEqual({ ...DEFAULT_PANELS, list: false });
    expect(listSort).toEqual({ key: 'dist', dir: 'asc' });
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
      plotted: ['trk', 'selHdg'],
      historyOpen: false,
    };

    // Act
    savePersisted(storage, state);
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
  it('reads a saved upper edge past the top stop as UNL and keeps the lower edge', () => {
    // Arrange
    const storage = memoryStorage({
      [PERSIST_KEY]: JSON.stringify({ settings: { filter: { lowerFl: 100, upperFl: 600 } } }),
    });

    // Act
    const { filter } = loadPersisted(storage, DEFAULTS).settings;

    // Assert
    expect(filter.lowerFl).toBe(100);
    expect(filter.upperFl).toBe(FL_MAX);
  });
});

describe('loadPersisted plotted', () => {
  it('keeps the readings it knows, each once, and falls back when the entry is no list', () => {
    // Arrange
    const stores = [['gs', 'bogus', 'alt', 'gs'], [], 'alt'].map((plotted) =>
      memoryStorage({ [PERSIST_KEY]: JSON.stringify({ plotted }) }),
    );

    // Act
    const plotted = stores.map((s) => loadPersisted(s, DEFAULTS).plotted);

    // Assert
    expect(plotted).toEqual([['gs', 'alt'], [], ['alt', 'gs']]);
  });
});

describe('loadPersisted plotted lanes', () => {
  it('keeps a stored plot within the lanes allowed', () => {
    // Arrange
    const storage = memoryStorage({
      [PERSIST_KEY]: JSON.stringify({ plotted: ['alt', 'gs', 'trk', 'ias', 'vs'] }),
    });

    // Act
    const { plotted } = loadPersisted(storage, DEFAULTS);

    // Assert
    expect(plotted).toEqual(['alt', 'gs', 'trk', 'ias']);
  });
});

describe('loadPersisted historyOpen', () => {
  it('keeps whether the history group is open, and falls back when that is no boolean', () => {
    // Arrange
    const stores = [false, 'closed'].map((historyOpen) =>
      memoryStorage({ [PERSIST_KEY]: JSON.stringify({ historyOpen }) }),
    );

    // Act
    const open = stores.map((st) => loadPersisted(st, DEFAULTS).historyOpen);

    // Assert
    expect(open).toEqual([false, true]);
  });
});
