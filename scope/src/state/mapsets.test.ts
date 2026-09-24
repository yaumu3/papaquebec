import { describe, expect, it } from 'bun:test';

import { EMPTY_AERO } from '../lib/mapdata';
import { armRemoval, BUILTIN_ID, createMapSets, freshId, importNote } from './mapsets';
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
    for (const id of ['a', BUILTIN_ID]) sets.toggleMapSet(id);

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
    for (const id of ['a', BUILTIN_ID]) sets.removeMapSet(id);

    // Assert
    expect(sets.mapSets().map((s) => s.id)).toEqual([BUILTIN_ID]);
    expect(loadMapSets(storage).imported).toEqual([]);
  });
});

describe('importNote', () => {
  it('reports a failure or an unsaved import, and nothing for a clean one', () => {
    // Arrange
    const results = [
      { ok: false as const, message: 'title: expected string' },
      { ok: true as const, kept: false },
      { ok: true as const, kept: true },
    ];

    // Act
    const notes = results.map(importNote);

    // Assert
    expect(notes).toEqual([
      'title: expected string',
      'imported for this session only: browser storage is full',
      null,
    ]);
  });
});

describe('armRemoval', () => {
  it('arms on the first click, removes on the second, and re-arms when another set is clicked', () => {
    // Arrange
    const clicks: [string | null, string][] = [
      [null, 'a'],
      ['a', 'a'],
      ['a', 'b'],
    ];

    // Act
    const out = clicks.map(([armed, clicked]) => armRemoval(armed, clicked));

    // Assert
    expect(out).toEqual([
      { armed: 'a', remove: null },
      { armed: null, remove: 'a' },
      { armed: 'b', remove: null },
    ]);
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
