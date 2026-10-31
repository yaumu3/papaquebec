/**
 * The chart: what the enabled map sets merge into. Each item is one named thing, holding the
 * geometry and properties of every Feature filed under it, so a stepped area keeps its steps.
 */

import { flatDistanceNm, type GeoPoint } from './geo';
import type { LonLat } from './mapdata';
import type { MapSetData, MapSetFeature } from './mapset';
import { isPointLayer, type Layer } from './mapsetFormat';

/** One Feature of an item, with the properties it was filed with. */
export interface ItemPart {
  geometry: MapSetFeature['geometry'];
  properties: MapSetFeature['properties'];
}

export interface ChartItem {
  /** The item's identity: its layer and naming parts as JSON, and for a point where it stands. */
  key: string;
  layer: Layer;
  parts: ItemPart[];
}

export type Chart = readonly ChartItem[];

/** Grid cells per degree: two positions in one cell are the same place (1e-5°, about 1 m). */
const GRID_PER_DEGREE = 1e5;

/** A coordinate's grid cell, an integer. */
export const toGrid = (degrees: number): number => Math.round(degrees * GRID_PER_DEGREE);

/** What names an item within its layer: a designator, an id, or for a hold its pattern. */
function naming({ properties: p, geometry: g }: MapSetFeature): unknown[] {
  if ('turn' in p) {
    const at = g.type === 'Point' ? g.coordinates.map(toGrid) : [];
    return [...at, p.turn, p.inboundMag, p.inboundTrue];
  }
  if ('id' in p) return p.layer === 'vfr' ? [p.id, p.ad] : [p.id];
  return [p.name];
}

/** Two points of one name are one thing if any position of one is within this of the other's. */
const SAME_POINT_NM = 1;

/** The items of one set by their name, which is their layer and naming; a repeat gains a part. */
function itemsByName(set: MapSetData): Map<string, ChartItem> {
  const items = new Map<string, ChartItem>();
  for (const feature of set.features) {
    const { layer } = feature.properties;
    const name = JSON.stringify([layer, ...naming(feature)]);
    const part = { geometry: feature.geometry, properties: feature.properties };
    const item = items.get(name);
    if (item) item.parts.push(part);
    else items.set(name, { key: name, layer, parts: [part] });
  }
  return items;
}

const positionsOf = ({ parts }: ChartItem): GeoPoint[] =>
  parts.flatMap(({ geometry: g }) =>
    g.type === 'Point' ? [{ lat: g.coordinates[1], lon: g.coordinates[0] }] : [],
  );

/** Whether items of one name are one thing: any but a point, and a point if it is near. */
function isSameThing(a: ChartItem, b: ChartItem): boolean {
  if (!isPointLayer(a.layer)) return true;
  return positionsOf(a).some((p) =>
    positionsOf(b).some((q) => flatDistanceNm(p, q) <= SAME_POINT_NM),
  );
}

/** A point is told from another of its name by where it stands. */
function keyed(name: string, item: ChartItem): ChartItem {
  const [first] = positionsOf(item);
  return first && isPointLayer(item.layer)
    ? { ...item, key: `${name}@${toGrid(first.lon)},${toGrid(first.lat)}` }
    : item;
}

/**
 * The items of the sets, which come in order of precedence, in order of first appearance. A
 * repeated item gains a part within a set; of items of several sets that are one thing, the
 * first set's is kept whole and the others are dropped.
 */
export function chartOf(sets: readonly MapSetData[]): Chart {
  const kept: ChartItem[] = [];
  const byName = new Map<string, ChartItem[]>();
  for (const set of sets) {
    for (const [name, item] of itemsByName(set)) {
      const same = byName.get(name) ?? [];
      if (same.some((other) => isSameThing(other, item))) continue;
      const added = keyed(name, item);
      kept.push(added);
      byName.set(name, [...same, added]);
    }
  }
  return kept;
}

/** A published limit in feet: `SFC` and `GND` are 0, `UNL` is unbounded, `FLnnn` is nnn hundreds. */
function limitFt(limit: string): number {
  if (limit === 'UNL') return Infinity;
  if (limit === 'SFC' || limit === 'GND') return 0;
  const level = /^FL(\d+)$/.exec(limit);
  return level ? Number(level[1]) * 100 : parseInt(limit, 10);
}

/**
 * Whether an area part is an upper stratum: its lower limit is above the surface, as for the
 * upper sectors of a FIR. A part with no lower limit is not one.
 */
export function isUpperStratum({ properties: p }: ItemPart): boolean {
  return 'lower' in p && p.lower !== undefined && limitFt(p.lower) > 0;
}

/**
 * The outlines of a geometry as source positions: a point's one position, a line, or a
 * polygon's exterior ring and its holes.
 */
export function outlinesOf(geometry: ItemPart['geometry']): LonLat[][] {
  if (geometry.type === 'Point') return [[geometry.coordinates]];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  return geometry.coordinates;
}
