import { describe, expect, it } from 'bun:test';

import { EMPTY_AERO } from '../lib/mapdata';
import { BUILTIN_ID, createMapSets, freshId } from './mapsets';
import { loadMapSets } from './mapsetsPersist';
import { fullStorage, memoryStorage } from './memoryStorage';

const fixes = { title: 'My fixes', waypoints: [{ id: 'CHIBA', lat: 35.6, lon: 140.1 }] }; // Chiba
const more = {
  title: 'More fixes',
  navaids: [{ id: 'NRE', kind: 'VOR-DME', lat: 35.78, lon: 140.36 }],
}; // RJAA
const fresh = () => createMapSets(memoryStorage());

describe('createMapSets', () => {
  it('starts with the built-in set alone, drawing nothing until its data arrives', () => {
    // Arrange
    const sets = fresh();

    // Act
    const [list, drawn] = [sets.mapSets(), sets.aero()];

    // Assert
    expect(list.map((s) => [s.id, s.builtin, s.enabled])).toEqual([[BUILTIN_ID, true, true]]);
    expect(drawn.waypoints).toEqual([]);
  });

  it('draws the built-in data once set', () => {
    // Arrange
    const sets = fresh();
    const data = { ...EMPTY_AERO, ...fixes, title: 'openAIP JP' };

    // Act
    sets.setBuiltinAero(data);

    // Assert
    expect(sets.mapSets()[0]?.data.title).toBe('openAIP JP');
    expect(sets.aero().waypoints.map((w) => w.id)).toEqual(['CHIBA']);
  });

  it('adds a valid import, enabled and persisted', () => {
    // Arrange
    const storage = memoryStorage();
    const sets = createMapSets(storage);

    // Act
    const out = sets.importMapSet(JSON.stringify(fixes), 'a');

    // Assert
    expect(out).toEqual({ ok: true, kept: true });
    expect(sets.mapSets().map((s) => s.id)).toEqual([BUILTIN_ID, 'a']);
    expect(sets.aero().waypoints.map((w) => w.id)).toEqual(['CHIBA']);
    expect(loadMapSets(storage).imported.map((s) => s.id)).toEqual(['a']);
  });

  it('replaces an earlier import with the same title', () => {
    // Arrange
    const sets = fresh();
    sets.importMapSet(JSON.stringify(fixes), 'a');

    // Act
    const out = sets.importMapSet(JSON.stringify({ ...fixes, waypoints: [] }), 'b');

    // Assert
    expect(out).toEqual({ ok: true, kept: true });
    expect(sets.mapSets().map((s) => s.id)).toEqual([BUILTIN_ID, 'b']);
    expect(sets.aero().waypoints).toEqual([]);
  });

  it('rejects text that is not JSON or not a valid set, changing nothing', () => {
    // Arrange
    const sets = fresh();

    // Act
    const out = [sets.importMapSet('{oops', 'a'), sets.importMapSet('{"waypoints":[]}', 'b')];

    // Assert
    expect(out[0]).toEqual({ ok: false, message: 'not JSON' });
    expect(out[1]?.ok).toBe(false);
    if (out[1]?.ok !== false) return;
    expect(out[1].message).toContain('title');
    expect(sets.mapSets()).toHaveLength(1);
  });

  it('says when an import could not be kept across reloads', () => {
    // Arrange
    const storage = fullStorage();
    const sets = createMapSets(storage);

    // Act
    const out = sets.importMapSet(JSON.stringify(fixes), 'a');

    // Assert
    expect(out).toEqual({ ok: true, kept: false });
    expect(sets.mapSets()).toHaveLength(2);
  });

  it('toggling a set takes it out of the drawn data and persists the flag', () => {
    // Arrange
    const storage = memoryStorage();
    const sets = createMapSets(storage);
    sets.importMapSet(JSON.stringify(fixes), 'a');
    sets.importMapSet(JSON.stringify(more), 'b');

    // Act
    sets.toggleMapSet('a');
    sets.toggleMapSet(BUILTIN_ID);

    // Assert
    expect(sets.aero().waypoints).toEqual([]);
    expect(sets.aero().navaids.map((n) => n.id)).toEqual(['NRE']);
    expect(loadMapSets(storage)).toMatchObject({
      builtinEnabled: false,
      imported: [
        { id: 'a', enabled: false },
        { id: 'b', enabled: true },
      ],
    });
  });

  it('removes an imported set but never the built-in one', () => {
    // Arrange
    const storage = memoryStorage();
    const sets = createMapSets(storage);
    sets.importMapSet(JSON.stringify(fixes), 'a');

    // Act
    sets.removeMapSet('a');
    sets.removeMapSet(BUILTIN_ID);

    // Assert
    expect(sets.mapSets().map((s) => s.id)).toEqual([BUILTIN_ID]);
    expect(loadMapSets(storage).imported).toEqual([]);
  });
});

describe('freshId', () => {
  it('uses randomUUID when the page has it and still yields distinct ids without it', () => {
    // Arrange
    const withUuid = { randomUUID: () => 'fixed-uuid' };
    const without = {};

    // Act
    const ids = [freshId(withUuid), freshId(without), freshId(without)];

    // Assert
    expect(ids[0]).toBe('fixed-uuid');
    expect(ids[1]).toMatch(/\S/);
    expect(ids[1]).not.toBe(ids[2]);
  });
});
