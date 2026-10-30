import { describe, expect, it } from 'bun:test';

import { validateMapSet } from '../lib/mapset';
import { BUILTIN_ID } from '../lib/mapsetFormat';
import { armRemoval, createMapSets, importNote } from './mapsets';
import { MAPSETS_KEY } from './mapsetsPersist';
import type { MapSetStore, StoredMapSet } from './mapsetStore';
import { memoryStorage } from './memoryStorage';

const setOf = (title: string, features: object[], id?: string) => ({
  type: 'FeatureCollection',
  version: 2,
  ...(id ? { id } : {}),
  title,
  features,
});
const pointAt = (layer: string, id: string) => ({
  type: 'Feature',
  properties: { layer, id },
  geometry: { type: 'Point', coordinates: [130.9, 33.9] },
});

const fixes = setOf('My fixes', [pointAt('fix', 'TAVRO')], 'my-fixes');
const more = setOf('More fixes', [pointAt('navaid', 'QDG')], 'more-fixes');
const builtIn = setOf('openAIP XX', [pointAt('fix', 'NIMBA')], BUILTIN_ID);

const parsed = (document: object) => {
  const verdict = validateMapSet(document);
  if (!verdict.ok) throw new Error(verdict.message);
  return verdict.data;
};
const stored = (document: object, enabled = true): StoredMapSet => {
  const data = parsed(document);
  return { identity: data.id ?? data.title, enabled, data };
};

/** A store over a map that logs each write, and can be told to refuse them. */
function spyStore(initial: StoredMapSet[] = [], refusing = false) {
  const records = new Map(initial.map((s) => [s.identity, s]));
  const writes: string[] = [];
  const store: MapSetStore = {
    all: () =>
      Promise.resolve(
        [...records.values()].toSorted((a, b) => a.identity.localeCompare(b.identity)),
      ),
    put(set) {
      writes.push(`put ${set.identity} ${set.enabled}`);
      if (refusing) return Promise.reject(new Error('refused'));
      records.set(set.identity, set);
      return Promise.resolve();
    },
    delete(identity) {
      writes.push(`delete ${identity}`);
      records.delete(identity);
      return Promise.resolve();
    },
  };
  return { store, records, writes };
}

const created = (spy = spyStore(), storage = memoryStorage()) => ({
  ...spy,
  storage,
  sets: createMapSets(storage, Promise.resolve(spy.store)),
});
const importing = (sets: ReturnType<typeof createMapSets>, document: object) =>
  sets.importMapSet(JSON.stringify(document));

describe('createMapSets', () => {
  it('starts with the built-in set alone, drawing nothing until its data arrives', () => {
    // Arrange
    const { sets } = created();

    // Act
    const [list, drawn] = [sets.mapSets(), sets.drawn()];

    // Assert
    expect(list.map((s) => [s.identity, s.builtin, s.enabled])).toEqual([[BUILTIN_ID, true, true]]);
    expect(drawn.waypoints).toEqual([]);
  });

  it('starts the built-in set as the stored flag left it', () => {
    // Arrange
    const storage = memoryStorage({ [MAPSETS_KEY]: '{"builtinEnabled":false}' });

    // Act
    const { sets } = created(spyStore(), storage);

    // Assert
    expect(sets.mapSets().map((s) => [s.identity, s.enabled])).toEqual([[BUILTIN_ID, false]]);
  });

  it('draws the built-in set once it arrives', () => {
    // Arrange
    const { sets } = created();
    const data = parsed(builtIn);

    // Act
    sets.setBuiltinMapSet(data);

    // Assert
    expect(sets.mapSets()[0]?.data.title).toBe('openAIP XX');
    expect(sets.drawn().waypoints.map((w) => w.id)).toEqual(['NIMBA']);
  });

  it('adds a valid import, enabled and stored under its identity', async () => {
    // Arrange
    const { sets, records } = created();

    // Act
    const out = importing(sets, fixes);
    const kept = out.ok ? await out.kept : null;

    // Assert
    expect(kept).toBe(true);
    expect(sets.mapSets().map((s) => s.identity)).toEqual([BUILTIN_ID, 'my-fixes']);
    expect(sets.drawn().waypoints.map((w) => w.id)).toEqual(['TAVRO']);
    expect([...records.keys()]).toEqual(['my-fixes']);
  });

  it('identifies a set without an id by its title', () => {
    // Arrange
    const { sets } = created();

    // Act
    importing(sets, setOf('Untagged', []));

    // Assert
    expect(sets.mapSets().map((s) => s.identity)).toEqual([BUILTIN_ID, 'Untagged']);
  });

  it('refuses a set whose identity is the built-in one', () => {
    // Arrange
    const { sets, writes } = created();
    const documents = [setOf('Any title', [], BUILTIN_ID), setOf(BUILTIN_ID, [])];

    // Act
    const out = documents.map((document) => importing(sets, document));

    // Assert
    expect(out).toEqual(documents.map(() => ({ ok: false, message: 'already built in: openaip' })));
    expect([sets.mapSets().length, writes]).toEqual([1, []]);
  });

  it('replaces an import of the same identity in place', () => {
    // Arrange
    const { sets } = created();
    importing(sets, fixes);
    importing(sets, more);

    // Act
    importing(sets, setOf('My fixes, revised', [], 'my-fixes'));

    // Assert
    expect(sets.mapSets().map((s) => [s.identity, s.data.title])).toEqual([
      [BUILTIN_ID, 'openAIP'],
      ['my-fixes', 'My fixes, revised'],
      ['more-fixes', 'More fixes'],
    ]);
    expect(sets.drawn().waypoints).toEqual([]);
  });

  it('rejects text that is not JSON or not a map set, changing nothing', () => {
    // Arrange
    const { sets, writes } = created();

    // Act
    const out = [sets.importMapSet('{oops'), sets.importMapSet('{"waypoints":[]}')];

    // Assert
    expect(out[0]).toEqual({ ok: false, message: 'not JSON' });
    expect(out[1]).toEqual({ ok: false, message: expect.stringContaining('type') });
    expect([sets.mapSets().length, writes]).toEqual([1, []]);
  });

  it('draws the enabled sets alone', () => {
    // Arrange
    const { sets } = created();
    importing(sets, fixes);
    importing(sets, more);

    // Act
    for (const identity of ['my-fixes', BUILTIN_ID]) sets.toggleMapSet(identity);

    // Assert
    expect(sets.drawn().waypoints).toEqual([]);
    expect(sets.drawn().navaids.map((n) => n.id)).toEqual(['QDG']);
    expect(sets.chart().map((item) => item.layer)).toEqual(['navaid']);
  });

  it('removes an imported set but never the built-in one', () => {
    // Arrange
    const { sets } = created();
    importing(sets, fixes);

    // Act
    for (const identity of ['my-fixes', BUILTIN_ID]) sets.removeMapSet(identity);

    // Assert
    expect(sets.mapSets().map((s) => s.identity)).toEqual([BUILTIN_ID]);
  });
});

describe('storage of imported sets', () => {
  it('puts the one record again to toggle a set', async () => {
    // Arrange
    const { sets, writes } = created();
    importing(sets, fixes);

    // Act
    sets.toggleMapSet('my-fixes');
    await sets.hydrated;

    // Assert
    expect(writes).toEqual(['put my-fixes true', 'put my-fixes false']);
  });

  it('deletes the one record to remove a set', async () => {
    // Arrange
    const { sets, writes, records } = created();
    importing(sets, fixes);
    importing(sets, more);

    // Act
    sets.removeMapSet('more-fixes');
    await sets.hydrated;

    // Assert
    expect(writes).toEqual(['put my-fixes true', 'put more-fixes true', 'delete more-fixes']);
    expect([...records.keys()]).toEqual(['my-fixes']);
  });

  it('keeps the built-in flag in browser storage and writes no record for it', async () => {
    // Arrange
    const { sets, writes, storage } = created();

    // Act
    sets.toggleMapSet(BUILTIN_ID);
    await sets.hydrated;

    // Assert
    expect(writes).toEqual([]);
    expect(storage.getItem(MAPSETS_KEY)).toBe('{"builtinEnabled":false}');
  });

  it('merges the stored sets in identity order once hydrated', async () => {
    // Arrange
    const { sets } = created(spyStore([stored(more), stored(fixes, false)]));

    // Act
    await sets.hydrated;

    // Assert
    expect(sets.mapSets().map((s) => [s.identity, s.enabled])).toEqual([
      [BUILTIN_ID, true],
      ['more-fixes', true],
      ['my-fixes', false],
    ]);
    expect(sets.drawn().navaids.map((n) => n.id)).toEqual(['QDG']);
  });

  it('keeps an import made before hydration finishes', async () => {
    // Arrange
    const { sets } = created(spyStore([stored(more), stored(setOf('Old', [], 'my-fixes'))]));
    importing(sets, fixes);

    // Act
    await sets.hydrated;

    // Assert
    expect(sets.mapSets().map((s) => [s.identity, s.data.title])).toEqual([
      [BUILTIN_ID, 'openAIP'],
      ['my-fixes', 'My fixes'],
      ['more-fixes', 'More fixes'],
    ]);
  });

  it('skips a stored record that no longer passes the strict parse', async () => {
    // Arrange
    const broken: StoredMapSet = JSON.parse(
      '{"identity":"broken","enabled":true,"data":{"title":"no type"}}',
    );
    const { sets } = created(spyStore([broken, stored(fixes)]));

    // Act
    await sets.hydrated;

    // Assert
    expect(sets.mapSets().map((s) => s.identity)).toEqual([BUILTIN_ID, 'my-fixes']);
  });

  it('draws an import for the session when the store refuses it, and says so', async () => {
    // Arrange
    const { sets } = created(spyStore([], true));

    // Act
    const out = importing(sets, fixes);
    const kept = out.ok ? await out.kept : null;

    // Assert
    expect(kept).toBe(false);
    expect(sets.drawn().waypoints.map((w) => w.id)).toEqual(['TAVRO']);
  });

  it('draws an import for the session when the store cannot be opened, and says so', async () => {
    // Arrange
    const sets = createMapSets(memoryStorage(), Promise.reject(new Error('no IndexedDB')));

    // Act
    const out = importing(sets, fixes);
    const kept = out.ok ? await out.kept : null;

    // Assert
    expect(kept).toBe(false);
    expect(sets.mapSets().map((s) => s.identity)).toEqual([BUILTIN_ID, 'my-fixes']);
  });
});

describe('importNote', () => {
  it('reports a failure or an unsaved import, and nothing for a clean one', async () => {
    // Arrange
    const results = [
      { ok: false as const, message: 'title: expected string' },
      { ok: true as const, kept: Promise.resolve(false) },
      { ok: true as const, kept: Promise.resolve(true) },
    ];

    // Act
    const notes = await Promise.all(results.map(importNote));

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
