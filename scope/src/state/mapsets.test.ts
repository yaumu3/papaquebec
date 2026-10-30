import { describe, expect, it } from 'bun:test';

import { validateMapSet } from '../lib/mapset';
import { BUILTIN_ID } from '../lib/mapsetFormat';
import { armRemoval, createMapSets, importNote } from './mapsets';
import { loadMapSets } from './mapsetsPersist';
import { fullStorage, memoryStorage } from './memoryStorage';

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
const importing = (sets: ReturnType<typeof createMapSets>, document: object) =>
  sets.importMapSet(JSON.stringify(document));
const fresh = () => createMapSets(memoryStorage());
const parsed = (document: object) => {
  const verdict = validateMapSet(document);
  if (!verdict.ok) throw new Error(verdict.message);
  return verdict.data;
};

describe('createMapSets', () => {
  it('starts with the built-in set alone, drawing nothing until its data arrives', () => {
    // Arrange
    const sets = fresh();

    // Act
    const [list, drawn] = [sets.mapSets(), sets.drawn()];

    // Assert
    expect(list.map((s) => [s.identity, s.builtin, s.enabled])).toEqual([[BUILTIN_ID, true, true]]);
    expect(drawn.waypoints).toEqual([]);
  });

  it('draws the built-in set once it arrives', () => {
    // Arrange
    const sets = fresh();
    const data = parsed(builtIn);

    // Act
    sets.setBuiltinMapSet(data);

    // Assert
    expect(sets.mapSets()[0]?.data.title).toBe('openAIP XX');
    expect(sets.drawn().waypoints.map((w) => w.id)).toEqual(['NIMBA']);
  });

  it('adds a valid import, enabled and persisted under its identity', () => {
    // Arrange
    const storage = memoryStorage();
    const sets = createMapSets(storage);

    // Act
    const out = importing(sets, fixes);

    // Assert
    expect(out).toEqual({ ok: true, kept: true });
    expect(sets.mapSets().map((s) => s.identity)).toEqual([BUILTIN_ID, 'my-fixes']);
    expect(sets.drawn().waypoints.map((w) => w.id)).toEqual(['TAVRO']);
    expect(loadMapSets(storage).imported.map((s) => s.identity)).toEqual(['my-fixes']);
  });

  it('identifies a set without an id by its title', () => {
    // Arrange
    const sets = fresh();

    // Act
    importing(sets, setOf('Untagged', []));

    // Assert
    expect(sets.mapSets().map((s) => s.identity)).toEqual([BUILTIN_ID, 'Untagged']);
  });

  it('refuses a set whose identity is the built-in one', () => {
    // Arrange
    const sets = fresh();
    const documents = [setOf('Any title', [], BUILTIN_ID), setOf(BUILTIN_ID, [])];

    // Act
    const out = documents.map((document) => importing(sets, document));

    // Assert
    expect(out).toEqual(documents.map(() => ({ ok: false, message: 'already built in: openaip' })));
    expect(sets.mapSets()).toHaveLength(1);
  });

  it('replaces an import of the same identity in place', () => {
    // Arrange
    const sets = fresh();
    importing(sets, fixes);
    importing(sets, more);

    // Act
    const out = importing(sets, setOf('My fixes, revised', [], 'my-fixes'));

    // Assert
    expect(out).toEqual({ ok: true, kept: true });
    expect(sets.mapSets().map((s) => [s.identity, s.data.title])).toEqual([
      [BUILTIN_ID, 'openAIP'],
      ['my-fixes', 'My fixes, revised'],
      ['more-fixes', 'More fixes'],
    ]);
    expect(sets.drawn().waypoints).toEqual([]);
  });

  it('rejects text that is not JSON or not a map set, changing nothing', () => {
    // Arrange
    const sets = fresh();

    // Act
    const out = [sets.importMapSet('{oops'), sets.importMapSet('{"waypoints":[]}')];

    // Assert
    expect(out[0]).toEqual({ ok: false, message: 'not JSON' });
    expect(out[1]).toEqual({ ok: false, message: expect.stringContaining('type') });
    expect(sets.mapSets()).toHaveLength(1);
  });

  it('says when an import could not be kept across reloads', () => {
    // Arrange
    const storage = fullStorage();
    const sets = createMapSets(storage);

    // Act
    const out = importing(sets, fixes);

    // Assert
    expect(out).toEqual({ ok: true, kept: false });
    expect(sets.mapSets()).toHaveLength(2);
  });

  it('draws the enabled sets alone, and persists the flags', () => {
    // Arrange
    const storage = memoryStorage();
    const sets = createMapSets(storage);
    importing(sets, fixes);
    importing(sets, more);

    // Act
    for (const identity of ['my-fixes', BUILTIN_ID]) sets.toggleMapSet(identity);

    // Assert
    expect(sets.drawn().waypoints).toEqual([]);
    expect(sets.drawn().navaids.map((n) => n.id)).toEqual(['QDG']);
    expect(sets.chart().map((item) => item.layer)).toEqual(['navaid']);
    expect(loadMapSets(storage)).toMatchObject({
      builtinEnabled: false,
      imported: [
        { identity: 'my-fixes', enabled: false },
        { identity: 'more-fixes', enabled: true },
      ],
    });
  });

  it('removes an imported set but never the built-in one', () => {
    // Arrange
    const storage = memoryStorage();
    const sets = createMapSets(storage);
    importing(sets, fixes);

    // Act
    for (const identity of ['my-fixes', BUILTIN_ID]) sets.removeMapSet(identity);

    // Assert
    expect(sets.mapSets().map((s) => s.identity)).toEqual([BUILTIN_ID]);
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
