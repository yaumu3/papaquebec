/** What the layer tree reads and writes: its items, which rows are open, and what a tap sets. */

import { batch, createMemo, createRoot } from 'solid-js';

import { LAYER_GROUPS, type ScopeLayer } from '../lib/layers';
import { type TreeItem, itemsIn, treeItemsOf } from '../lib/treeItems';
import { afterDot, type LayerLeaves } from '../lib/treeRows';
import { isItemShown, itemsSetTo } from '../lib/visibility';
import { layerState, setLayerState } from './layerVisibility';
import { topology } from './mapsets';
import { setSettings, settings } from './settings';

/** The chart's items for the tree; a memo in a root of its own, like `drawnPoints`. */
export const treeItems = createRoot(() => createMemo(() => treeItemsOf(topology())));

export type OpenList = 'openGroups' | 'openLayers';

export const isOpen = (list: OpenList, id: string): boolean => settings[list].includes(id);

const flipped = (list: readonly string[], id: string): string[] =>
  list.includes(id) ? list.filter((open) => open !== id) : [...list, id];

export function toggleOpen(list: OpenList, id: string): void {
  setSettings(list, flipped(settings[list], id));
}

const keysIn = (layer: ScopeLayer): string[] => itemsIn(treeItems(), layer).map((item) => item.key);

/** What a row reaches in a layer: every item of the chart, until a search narrows the list. */
export function leavesOf(layer: ScopeLayer): LayerLeaves {
  const present = keysIn(layer);
  return { layer, listed: present, present };
}

export const groupLeaves = (group: (typeof LAYER_GROUPS)[number]): LayerLeaves[] =>
  group.layers.map(leavesOf);

/** A tap on a dot: every leaf under it shown, or all hidden when all are shown already. */
export function tapDot(leaves: readonly LayerLeaves[]): void {
  batch(() => {
    for (const [layer, state] of afterDot(leaves, layerState, false)) setLayerState(layer, state);
  });
}

/** A tap on an item row: that item shown or hidden. */
export function tapItem({ key, layer }: TreeItem): void {
  const state = layerState(layer);
  setLayerState(layer, itemsSetTo(state, [key], !isItemShown(state, key), keysIn(layer)));
}
