/** What the layer tree reads and writes: its items, which rows are open, and what a tap sets. */

import { batch, createMemo, createRoot, createSignal } from 'solid-js';

import type { ChartItem } from '../lib/chart';
import { LAYER_GROUPS } from '../lib/layers';
import type { ScopeLayer } from '../lib/mapsetFormat';
import { type TreeItem, itemsIn, treeItemsOf } from '../lib/treeItems';
import { afterDot, type LayerLeaves } from '../lib/treeRows';
import { searchTree, termsOf } from '../lib/treeSearch';
import { isItemShown, itemsSetTo } from '../lib/visibility';
import { layerState, setLayerState } from './layerVisibility';
import { topology } from './mapsets';
import { setSettings, settings } from './settings';

const [query, setQueryText] = createSignal('');
/** The rows closed during this search; every change of the query opens them all again. */
const [closedInSearch, setClosedInSearch] = createSignal<readonly string[]>([]);

export { query };

export const terms = () => termsOf(query());

/** Whether the tree is filtered: a query of spaces is none. */
export const searching = () => terms().length > 0;

export function setQuery(text: string): void {
  batch(() => {
    setQueryText(text);
    setClosedInSearch([]);
  });
}

/** The search box's input: a composition in progress waits for its end. */
export function typeQuery(text: string, composing: boolean): void {
  if (!composing) setQuery(text);
}

/**
 * The chart's items for the tree, and what the search keeps of them; memos in a root of their
 * own, like `drawnPoints`.
 */
export const { treeItems, found } = createRoot(() => {
  const items = createMemo(() => treeItemsOf(topology()));
  return {
    treeItems: items,
    found: createMemo(() => (searching() ? searchTree(items(), terms()) : null)),
  };
});

const [underMouse, setUnderMouse] = createSignal<string | null>(null);
const [focused, setFocused] = createSignal<string | null>(null);

/** The key of the item row under the mouse, else of the one with focus. */
export const pointedAt = (): string | null => underMouse() ?? focused();

/** A row's pointer or focus gone only clears its own key: another row may have taken it since. */
const clearing = (key: string) => (now: string | null) => (now === key ? null : now);

export const enterRow = (key: string): void => void setUnderMouse(key);
export const leaveRow = (key: string): void => void setUnderMouse(clearing(key));
export const focusRow = (key: string): void => void setFocused(key);
export const blurRow = (key: string): void => void setFocused(clearing(key));

/** The items the search names on their own rows, to trace on the scope. */
export const searchedItems = (): readonly ChartItem[] => found()?.traced ?? [];

/** The item the tree points at, whether it draws or not: pointing at a hidden one finds it. */
export function pointedItem(): ChartItem | null {
  const key = pointedAt();
  return key === null ? null : (topology().chart.find((item) => item.key === key) ?? null);
}

export type OpenList = 'openGroups' | 'openLayers';

/** Whether a row is open: while searching, every row but those closed since the query changed. */
export const isOpen = (list: OpenList, id: string): boolean =>
  searching() ? !closedInSearch().includes(id) : settings[list].includes(id);

const flipped = (list: readonly string[], id: string): string[] =>
  list.includes(id) ? list.filter((open) => open !== id) : [...list, id];

/** Opens or closes a row; while searching that is not remembered. */
export function toggleOpen(list: OpenList, id: string): void {
  if (searching()) setClosedInSearch(flipped(closedInSearch(), id));
  else setSettings(list, flipped(settings[list], id));
}

const keysIn = (layer: ScopeLayer): string[] => itemsIn(treeItems(), layer).map((item) => item.key);

/** The items the tree lists under a layer: those the search keeps, or all of them. */
export const listedItems = (layer: ScopeLayer): readonly TreeItem[] =>
  found()?.layers.get(layer) ?? itemsIn(treeItems(), layer);

/** Whether the tree lists a layer: not while a search keeps nothing of it. */
export const isLayerListed = (layer: ScopeLayer): boolean => found()?.layers.has(layer) ?? true;

/** What a row reaches in a layer: the items listed, of all those in the chart. */
export function leavesOf(layer: ScopeLayer): LayerLeaves {
  return { layer, listed: listedItems(layer).map((item) => item.key), present: keysIn(layer) };
}

export const groupLeaves = (group: (typeof LAYER_GROUPS)[number]): LayerLeaves[] =>
  group.layers.filter(isLayerListed).map(leavesOf);

/** A tap on a dot: every leaf under it shown, or all hidden when all are shown already. */
export function tapDot(leaves: readonly LayerLeaves[]): void {
  batch(() => {
    for (const [layer, state] of afterDot(leaves, layerState, searching()))
      setLayerState(layer, state);
  });
}

/** A tap on an item row: that item shown or hidden. */
export function tapItem({ key, layer }: TreeItem): void {
  const state = layerState(layer);
  setLayerState(layer, itemsSetTo(state, [key], !isItemShown(state, key), keysIn(layer)));
}
