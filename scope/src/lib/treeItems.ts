/**
 * The items the tree lists: each chart item with the name and the tag its row shows, grouped by
 * layer and put in order.
 */

import { type ChartItem, type ItemPart, gridIdentity, itemKind } from './chart';
import { type ScopeLayer, LAYER_NAMES } from './layers';
import { POINT_LAYERS } from './mapsetFormat';
import { stratumTag } from './stratum';
import type { ChartPoint, Topology } from './topology';

export interface TreeItem extends ChartItem {
  name: string;
  /** The text at the row's right: kind, stratum or aerodrome; empty for none. */
  tag: string;
}

/** The items of each layer that has any, in the order the tree lists them. */
export type TreeItems = ReadonlyMap<ScopeLayer, readonly TreeItem[]>;

const NONE: readonly TreeItem[] = [];

/** The items of a layer; a layer without any lists none. */
export const itemsIn = (items: TreeItems, layer: ScopeLayer): readonly TreeItem[] =>
  items.get(layer) ?? NONE;

const collator = new Intl.Collator('en');
const collate = (a: string, b: string): number => collator.compare(a, b);

/** The id of the first point on each grid cell, in point layer order. */
function idsByCell(points: readonly ChartPoint[]): Map<string, string> {
  const ordered = points.toSorted(
    (a, b) => POINT_LAYERS.indexOf(a.layer) - POINT_LAYERS.indexOf(b.layer),
  );
  const ids = new Map<string, string>();
  for (const { at, id } of ordered) if (!ids.has(gridIdentity(at))) ids.set(gridIdentity(at), id);
  return ids;
}

/** A hold is named by the point it is flown from, else by its position, latitude first. */
function holdName({ geometry }: ItemPart, ids: ReadonlyMap<string, string>): string {
  if (geometry.type !== 'Point') return '';
  const [lon, lat] = geometry.coordinates;
  return ids.get(gridIdentity(geometry.coordinates)) ?? `${lat.toFixed(4)} ${lon.toFixed(4)}`;
}

function nameOf(part: ItemPart, ids: ReadonlyMap<string, string>): string {
  const { properties: p } = part;
  if ('turn' in p) return holdName(part, ids);
  return 'id' in p ? p.id : p.name;
}

function tagOf(item: ChartItem, { properties: p }: ItemPart): string {
  const { layer, parts } = item;
  if (layer === 'sector') return stratumTag(parts);
  if (layer === 'vfr') return 'ad' in p ? (p.ad ?? '') : '';
  const kind = itemKind(item);
  return kind === undefined || kind === LAYER_NAMES[layer] ? '' : kind;
}

const byNameThenTag = (a: TreeItem, b: TreeItem): number =>
  collate(a.name, b.name) || collate(a.tag, b.tag);

/** The items of a topology's chart for the tree, by layer; chart order breaks every tie. */
export function treeItemsOf({ chart, points }: Topology): TreeItems {
  const ids = idsByCell(points);
  const layers = new Map<ScopeLayer, TreeItem[]>();
  for (const item of chart) {
    const [first] = item.parts;
    if (!first) continue;
    const listed = layers.get(item.layer) ?? [];
    listed.push({ ...item, name: nameOf(first, ids), tag: tagOf(item, first) });
    layers.set(item.layer, listed);
  }
  return new Map([...layers].map(([layer, items]) => [layer, items.toSorted(byNameThenTag)]));
}
