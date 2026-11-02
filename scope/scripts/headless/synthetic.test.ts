import { describe, expect, it } from 'bun:test';

import { chartOf } from '../../src/lib/chart';
import { type MapSetData, validateMapSet } from '../../src/lib/mapset';
import { topologyOf } from '../../src/lib/topology';
import { syntheticMapSet } from './synthetic';

/** RJTT */
const SITE = { lat: 35.5533, lon: 139.7811 };

const { data, routeFixes } = syntheticMapSet({ site: SITE });
const topology = topologyOf(chartOf([data]));

/** The name of each item of `layer`, once however many parts it has. */
const itemsIn = (set: MapSetData, layer: string) =>
  new Set(
    set.features
      .filter((f) => f.properties.layer === layer)
      .map((f) => ('name' in f.properties ? f.properties.name : undefined)),
  );

const nearly = (value: number, wanted: number) => Math.abs(value - wanted) / wanted;

const polygonsOf = (set: MapSetData, test: (lower: string | undefined) => boolean) =>
  set.features.flatMap(({ properties: p, geometry: g }) =>
    p.layer === 'sector' && g.type === 'Polygon' && test('lower' in p ? p.lower : undefined)
      ? [g.coordinates]
      : [],
  );

const pointsIn = (set: MapSetData, layer: string) =>
  set.features.filter((f) => f.properties.layer === layer);

const routes = data.features.flatMap(({ properties: p, geometry: g }) =>
  g.type === 'LineString' && 'name' in p && p.name
    ? [{ layer: p.layer, name: p.name, line: g.coordinates }]
    : [],
);

const routesOn = (...layers: string[]) => routes.filter((r) => layers.includes(r.layer));

const isOneWay = ({ properties: p }: MapSetData['features'][number]) =>
  'oneWay' in p && p.oneWay === true;

const isHigh = (lower: string | undefined) => lower !== undefined;

const lonsOf = (set: MapSetData) =>
  polygonsOf(set, () => true).flatMap(([ring = []]) => ring.map(([lon]) => lon));

const edgesOf = (layer: string) =>
  new Set(
    topology.routes.paths.filter((p) => p.layer === layer).flatMap((p) => Array.from(p.edges)),
  );

const spanOf = (set: MapSetData) => Math.max(...lonsOf(set)) - Math.min(...lonsOf(set));

describe('syntheticMapSet', () => {
  it('passes the strict parse', () => {
    // Arrange
    const raw: unknown = JSON.parse(JSON.stringify(data));

    // Act
    const valid = validateMapSet(raw);

    // Assert
    expect(valid).toMatchObject({ ok: true });
  });

  it('gives the same bytes for the same seed', () => {
    // Arrange
    const first = JSON.stringify(data);

    // Act
    const second = JSON.stringify(syntheticMapSet({ site: SITE }).data);

    // Assert
    expect(second === first).toBe(true);
  });

  it('gives another set for another seed', () => {
    // Arrange
    const first = JSON.stringify(data);

    // Act
    const other = JSON.stringify(syntheticMapSet({ site: SITE, seed: 2 }).data);

    // Assert
    expect(other === first).toBe(false);
  });

  it('holds about 55,000 unique area edges', () => {
    // Arrange
    const edges = topology.areas.edgeCount;

    // Act
    const off = nearly(edges, 55_000);

    // Assert
    expect(off).toBeLessThan(0.1);
  });

  it('holds about 48,000 unique route edges', () => {
    // Arrange
    const edges = topology.routes.edgeCount;

    // Act
    const off = nearly(edges, 48_000);

    // Assert
    expect(off).toBeLessThan(0.1);
  });

  it.each([
    ['fir', 1],
    ['tma', 15],
    ['ctr', 40],
    ['pr', 20],
    ['dng', 20],
    ['tra', 20],
  ])('holds the items of %s', (layer, wanted) => {
    // Arrange
    const items = itemsIn(data, layer);

    // Act
    const off = nearly(items.size, wanted);

    // Assert
    expect(off).toBeLessThan(0.1);
  });

  it.each([
    ['fix', 1300],
    ['navaid', 150],
    ['hold', 100],
  ])('holds the points of %s', (layer, wanted) => {
    // Arrange
    const points = pointsIn(data, layer);

    // Act
    const off = nearly(points.length, wanted);

    // Assert
    expect(off).toBeLessThan(0.1);
  });

  it('holds 300 airways of both kinds and 100 procedures of every kind', () => {
    // Arrange
    const has = (layer: string) => routesOn(layer).length > 0;

    // Act
    const counts = {
      airways: routesOn('conv', 'rnav').length,
      conv: has('conv'),
      rnav: has('rnav'),
      procedures: routesOn('sid', 'star', 'trans').length,
      sid: has('sid'),
      star: has('star'),
      trans: has('trans'),
    };

    // Assert
    expect(counts).toEqual({
      airways: 300,
      conv: true,
      rnav: true,
      procedures: 100,
      sid: true,
      star: true,
      trans: true,
    });
  });

  it('holds a navaid of every kind, and a few of none', () => {
    // Arrange
    const kinds = pointsIn(data, 'navaid').map((f) => f.properties.kind);

    // Act
    const none = kinds.filter((kind) => kind === undefined).length;

    // Assert
    expect(new Set(kinds)).toEqual(
      new Set(['VOR', 'DME', 'VOR/DME', 'TACAN', 'VORTAC', 'NDB', undefined]),
    );
    expect(none).toBeGreaterThan(0);
    expect(none).toBeLessThan(kinds.length / 5);
  });

  it('holds holds of both kinds', () => {
    // Arrange
    const holds = pointsIn(data, 'hold');

    // Act
    const rnav = holds.filter((f) => f.properties.kind === 'RNAV').length;

    // Assert
    expect(rnav).toBeGreaterThan(0);
    expect(rnav).toBeLessThan(holds.length);
  });

  it('makes some airways one-way, and every procedure', () => {
    // Arrange
    const airways = data.features.filter(({ properties: { layer } }) =>
      ['conv', 'rnav'].includes(layer),
    );
    const procedures = data.features.filter(({ properties: { layer } }) =>
      ['sid', 'star', 'trans'].includes(layer),
    );

    // Act
    const oneWay = airways.filter(isOneWay).length;

    // Assert
    expect(oneWay).toBeGreaterThan(airways.length / 5);
    expect(oneWay).toBeLessThan(airways.length / 2);
    expect(procedures.every(isOneWay)).toBe(true);
  });

  it('has airways of both kinds share segments, on the same vertices', () => {
    // Arrange
    const [conv, rnav] = [edgesOf('conv'), edgesOf('rnav')];

    // Act
    const shared = [...conv].filter((edge) => rnav.has(edge)).length;

    // Assert
    expect(shared).toBeGreaterThan(1000);
  });

  it('densifies a segment of an airway to about 20 vertices', () => {
    // Arrange
    const airways = routes.filter((r) => r.layer === 'conv' || r.layer === 'rnav');

    // Act
    const perSegment = airways.map((r) => {
      const fixes = routeFixes.get(r.name) ?? [];
      return (r.line.length - 1) / (fixes.length - 1);
    });

    // Assert
    expect(new Set(perSegment)).toEqual(new Set([20]));
  });

  it('flies a departure out of an aerodrome and an arrival into one', () => {
    // Arrange
    const ports = new Set(pointsIn(data, 'ad').map((f) => String(f.geometry.coordinates)));

    // Act
    const [sidsOut, starsIn] = [
      routesOn('sid').every(({ line }) => ports.has(String(line[0]))),
      routesOn('star').every(({ line }) => ports.has(String(line.at(-1)))),
    ];

    // Assert
    expect([sidsOut, starsIn]).toEqual([true, true]);
  });

  it("has every route's fixes among its vertices, in order", () => {
    // Arrange
    const at = new Map(
      data.features.flatMap(({ properties: p, geometry: g }) =>
        'id' in p && g.type === 'Point' ? [[p.id, String(g.coordinates)]] : [],
      ),
    );

    // Act
    const missing = routes.flatMap(({ name, line }) => {
      const vertices = line.map(String);
      const fixes = routeFixes.get(name) ?? [];
      const places = fixes.map((id) => vertices.indexOf(at.get(id) ?? ''));
      const inOrder = places.every((p, i) => p >= 0 && p > (places[i - 1] ?? -1));
      return fixes.length >= 2 && inOrder ? [] : [name];
    });

    // Assert
    expect(missing).toEqual([]);
  });

  it('holds 30 low and 15 high sectors', () => {
    // Arrange
    const isLow = (lower: string | undefined) => !isHigh(lower);

    // Act
    const counts = [polygonsOf(data, isLow).length, polygonsOf(data, isHigh).length];

    // Assert
    expect(counts).toEqual([30, 15]);
  });

  it('files some approach control areas in several parts', () => {
    // Arrange
    const tmas = data.features.filter((f) => f.properties.layer === 'tma');

    // Act
    const parts = tmas.length - itemsIn(data, 'tma').size;

    // Assert
    expect(parts).toBeGreaterThanOrEqual(8);
  });

  it('gives low and high sectors of one footprint the same vertices', () => {
    // Arrange
    const lows = new Set(
      polygonsOf(data, (lower) => lower === undefined).map((rings) => JSON.stringify(rings)),
    );

    // Act
    const shared = polygonsOf(data, (lower) => lower !== undefined).filter((rings) =>
      lows.has(JSON.stringify(rings)),
    );

    // Assert
    expect(shared.length).toBeGreaterThanOrEqual(5);
  });

  it('writes a line two sectors share on identical vertices', () => {
    // Arrange
    const rings = polygonsOf(data, (lower) => !isHigh(lower));
    const lines = 6 * 6 + 7 * 5;
    const corners = 7 * 6;

    // Act
    const vertices = new Set(rings.flat(2).map(String)).size;

    // Assert
    expect(vertices).toBe(lines * 214 + corners);
  });

  it('counts every line two sectors share once, the FIR outline among them', () => {
    // Arrange
    const sectorPaths = topology.areas.paths.filter(
      (p) => p.layer === 'sector' || p.layer === 'fir',
    );

    const occurrences = sectorPaths.reduce((n, p) => n + p.edges.length, 0);

    // Act
    const distinct = new Set(sectorPaths.flatMap((p) => Array.from(p.edges))).size;

    // Assert
    expect(distinct).toBeLessThan(occurrences / 2);
  });

  it('multiplies the items by the scale, spread over a wider area', () => {
    // Arrange
    const scale = 2;

    // Act
    const { data: wide } = syntheticMapSet({ site: SITE, scale });

    // Assert
    expect(itemsIn(wide, 'ctr').size).toBe(80);
    expect(itemsIn(wide, 'sector').size).toBe(90);
    expect(pointsIn(wide, 'fix').length).toBe(2600);
    expect(pointsIn(wide, 'hold').length).toBe(200);
    expect(nearly(spanOf(wide) / spanOf(data), Math.SQRT2)).toBeLessThan(0.1);
  });

  it('centres the set on the site', () => {
    // Arrange
    const elsewhere = { lat: -33.9, lon: 151.2 };

    // Act
    const { data: moved } = syntheticMapSet({ site: elsewhere });

    // Assert
    const lats = polygonsOf(moved, () => true).flatMap(([ring = []]) => ring.map(([, lat]) => lat));
    expect(nearly((Math.max(...lats) + Math.min(...lats)) / 2, elsewhere.lat)).toBeLessThan(0.05);
  });
});
