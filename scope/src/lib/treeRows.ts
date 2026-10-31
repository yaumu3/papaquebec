/**
 * The tree's rows from their leaves: a row's state, a group's count, what a dot sets, and a
 * layer's summary. A leaf is an item, or a layer without items.
 */

import { isScopeMade, type ScopeLayer } from './layers';
import type { TreeItem } from './treeItems';
import { everyItemSet, isItemShown, itemsSetTo, type LayerState } from './visibility';

export type RowState = 'on' | 'off' | 'mixed';

/**
 * What a row reaches in one layer: the keys the tree lists and every key in the chart. A layer
 * with no keys in the chart is a leaf itself.
 */
export interface LayerLeaves {
  layer: ScopeLayer;
  listed: readonly string[];
  present: readonly string[];
}

export type StateOf = (layer: ScopeLayer) => LayerState;

/** Whether each leaf of the layer is shown. */
const leafShown = ({ listed, present }: LayerLeaves, state: LayerState): boolean[] =>
  present.length > 0 ? listed.map((key) => isItemShown(state, key)) : [state.mode];

export function rowStateOf(leaves: readonly LayerLeaves[], stateOf: StateOf): RowState {
  const shown = leaves.flatMap((layer) => leafShown(layer, stateOf(layer.layer)));
  if (shown.every(Boolean)) return 'on';
  return shown.some(Boolean) ? 'mixed' : 'off';
}

/** The layers of which anything is shown, over the layers listed. */
export function groupCount(leaves: readonly LayerLeaves[], stateOf: StateOf) {
  const on = leaves.filter((layer) => rowStateOf([layer], stateOf) !== 'off').length;
  return { on, all: leaves.length };
}

/**
 * The layers a dot sets: every leaf shown, unless all are shown already and then every leaf
 * hidden. While searching a layer with items sets only the items listed, one by one.
 */
export function afterDot(
  leaves: readonly LayerLeaves[],
  stateOf: StateOf,
  searching: boolean,
): [ScopeLayer, LayerState][] {
  const on = rowStateOf(leaves, stateOf) !== 'on';
  return leaves.map(({ layer, listed, present }) => [
    layer,
    searching && present.length > 0
      ? itemsSetTo(stateOf(layer), listed, on, present)
      : everyItemSet(on),
  ]);
}

interface Summary {
  text: string;
  /** `subset` is for some items shown, written in the brighter text colour. */
  tone: 'count' | 'subset' | 'none';
}

/** Up to this many shown names are written out; more are counted. */
const NAMES_MAX = 3;

/** A layer row's summary over all its items: none for a layer the scope makes itself. */
export function layerSummary(
  layer: ScopeLayer,
  items: readonly TreeItem[],
  state: LayerState,
): Summary | null {
  if (isScopeMade(layer)) return null;
  if (items.length === 0) return { text: '—', tone: 'none' };
  const shown = items.filter(({ key }) => isItemShown(state, key));
  if (shown.length === 0 || shown.length === items.length) {
    return { text: String(items.length), tone: 'count' };
  }
  const text =
    shown.length <= NAMES_MAX
      ? shown.map(({ name }) => name).join(' ')
      : `${shown.length}/${items.length}`;
  return { text, tone: 'subset' };
}
