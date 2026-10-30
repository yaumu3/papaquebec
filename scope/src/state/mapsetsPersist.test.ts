import { describe, expect, it } from 'bun:test';

import { loadMapSets, MAPSETS_KEY, saveMapSets } from './mapsetsPersist';
import { fullStorage, memoryStorage } from './memoryStorage';

describe('loadMapSets', () => {
  it('starts with the built-in set on when nothing usable is stored', () => {
    // Arrange
    const storages = [
      memoryStorage(),
      memoryStorage({ [MAPSETS_KEY]: '{not json' }),
      memoryStorage({ [MAPSETS_KEY]: '{"builtinEnabled":"yes"}' }),
    ];

    // Act
    const loaded = storages.map(loadMapSets);

    // Assert
    expect(loaded).toEqual(storages.map(() => ({ builtinEnabled: true })));
  });

  it('keeps a stored flag', () => {
    // Arrange
    const storage = memoryStorage({ [MAPSETS_KEY]: '{"builtinEnabled":false}' });

    // Act
    const loaded = loadMapSets(storage);

    // Assert
    expect(loaded).toEqual({ builtinEnabled: false });
  });
});

describe('saveMapSets', () => {
  it('round-trips through storage', () => {
    // Arrange
    const storage = memoryStorage();

    // Act
    saveMapSets(storage, { builtinEnabled: false });

    // Assert
    expect(loadMapSets(storage)).toEqual({ builtinEnabled: false });
    expect(storage.getItem(MAPSETS_KEY)).toBe('{"builtinEnabled":false}');
  });

  it('drops a write the storage refuses', () => {
    // Arrange
    const storage = fullStorage();

    // Act
    saveMapSets(storage, { builtinEnabled: true });

    // Assert
    expect(storage.length).toBe(0);
  });
});
