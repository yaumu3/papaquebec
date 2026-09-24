import { describe, expect, it } from 'bun:test';

import { EMPTY_AERO } from '../lib/mapdata';
import { loadMapSets, MAPSETS_KEY, saveMapSets } from './mapsetsPersist';
import { fullStorage, memoryStorage } from './memoryStorage';

const fixes = {
  ...EMPTY_AERO,
  title: 'My fixes',
  waypoints: [{ id: 'CHIBA', lat: 35.6, lon: 140.1 }],
}; // Chiba

describe('loadMapSets', () => {
  it('starts with the built-in set on and nothing imported', () => {
    // Arrange
    const empty = memoryStorage();
    const broken = memoryStorage({ [MAPSETS_KEY]: '{not json' });

    // Act
    const out = [loadMapSets(empty), loadMapSets(broken)];

    // Assert
    expect(out).toEqual([
      { builtinEnabled: true, imported: [] },
      { builtinEnabled: true, imported: [] },
    ]);
  });

  it('keeps imported sets that still validate and drops the rest', () => {
    // Arrange
    const stored = {
      builtinEnabled: false,
      imported: [
        { id: 'a', enabled: false, data: fixes },
        { id: 'b', enabled: true, data: { waypoints: [] } },
        { id: 7, enabled: true, data: fixes },
        'junk',
      ],
    };
    const storage = memoryStorage({ [MAPSETS_KEY]: JSON.stringify(stored) });

    // Act
    const out = loadMapSets(storage);

    // Assert
    expect(out).toEqual({
      builtinEnabled: false,
      imported: [{ id: 'a', enabled: false, data: fixes }],
    });
  });
});

describe('saveMapSets', () => {
  it('round-trips through storage and reports success', () => {
    // Arrange
    const storage = memoryStorage();
    const state = { builtinEnabled: true, imported: [{ id: 'a', enabled: true, data: fixes }] };

    // Act
    const saved = saveMapSets(storage, state);
    const back = loadMapSets(storage);

    // Assert
    expect(saved).toBe(true);
    expect(back).toEqual(state);
  });

  it('reports a storage that refuses the write', () => {
    // Arrange
    const storage = fullStorage();

    // Act
    const saved = saveMapSets(storage, { builtinEnabled: true, imported: [] });

    // Assert
    expect(saved).toBe(false);
  });
});
