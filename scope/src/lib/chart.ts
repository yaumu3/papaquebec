/**
 * The chart: what the enabled map sets merge into. Each item is one named thing, holding the
 * geometry and properties of every Feature filed under it, so a stepped area keeps its steps.
 */

import type { MapSetData, MapSetFeature } from './mapset';
import type { Layer } from './mapsetFormat';

/** One Feature of an item, with the properties it was filed with. */
export interface ItemPart {
  geometry: MapSetFeature['geometry'];
  properties: MapSetFeature['properties'];
}

export interface ChartItem {
  /** The item's identity: its set, layer and naming parts, as JSON. */
  key: string;
  layer: Layer;
  parts: ItemPart[];
}

export type Chart = readonly ChartItem[];

/** A set is known by its `id` member, else its title. */
export const setIdentity = (set: MapSetData): string => set.id ?? set.title;

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

/** The items of the sets in order of first appearance; a repeated item gains a part. */
export function chartOf(sets: readonly MapSetData[]): Chart {
  const items = new Map<string, ChartItem>();
  for (const set of sets) {
    for (const feature of set.features) {
      const { layer } = feature.properties;
      const key = JSON.stringify([setIdentity(set), layer, ...naming(feature)]);
      const part = { geometry: feature.geometry, properties: feature.properties };
      const item = items.get(key);
      if (item) item.parts.push(part);
      else items.set(key, { key, layer, parts: [part] });
    }
  }
  return [...items.values()];
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
