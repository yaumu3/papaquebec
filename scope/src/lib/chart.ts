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

const HOLD_DEGREES = 1e-5;
const toHoldGrid = (degrees: number) => Math.round(degrees / HOLD_DEGREES) * HOLD_DEGREES;

/** What names an item within its layer: a designator, an id, or for a hold its pattern. */
function naming({ properties: p, geometry: g }: MapSetFeature): unknown[] {
  if ('turn' in p) {
    const at = g.type === 'Point' ? g.coordinates.map(toHoldGrid) : [];
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
