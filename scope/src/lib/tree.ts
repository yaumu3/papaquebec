/**
 * The layer tree: the items it lists, its rows' state and summaries, and searching it. A leaf is
 * an item, or a layer without items. A query is upper-cased terms, and a term matches a text when
 * it starts one of the text's words.
 */

import { type ChartItem, type ItemPart, gridIdentity, itemKind } from './chart';
import { LAYER_GROUPS, LAYER_TABLE } from './layers';
import { isChartLayer, type ScopeLayer, POINT_LAYERS } from './mapsetFormat';
import { stratumTag } from './stratum';
import type { ChartPoint, Topology } from './topology';
import { everyItemSet, isItemShown, itemsSetTo, type LayerState } from './visibility';

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
  return kind === undefined || kind === LAYER_TABLE[layer].name ? '' : kind;
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

/** The rows a list puts down at once: its eight in view and as many past them. */
export const FIRST_ROWS = 16;

/** The rows of a list: until it has drawn, those that can be seen. */
export const rowsNow = (keys: readonly string[], drawn: boolean): readonly string[] =>
  drawn ? keys : keys.slice(0, FIRST_ROWS);

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
  if (!isChartLayer(layer)) return null;
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

/** A layer row's full name for its title: with the AIP reference, and when no set has data for it. */
export function layerTitle(layer: ScopeLayer, hasItems: boolean): string {
  const ref = LAYER_TABLE[layer].aip;
  const named =
    ref === undefined ? LAYER_TABLE[layer].name : `${LAYER_TABLE[layer].name}, AIP ${ref}`;
  return hasItems || !isChartLayer(layer) ? named : `${named}, no data in the enabled sets`;
}

/** The characters after which a word starts, besides the start of the text. */
const WORD_BREAKS = ' ./-()';

/** The query's terms: upper-cased, split at spaces, none empty. */
export const termsOf = (query: string): string[] => query.toUpperCase().split(' ').filter(Boolean);

/** Every index at which `term` starts a word of `text`, compared in upper case. */
function wordStarts(text: string, term: string): number[] {
  const upper = text.toUpperCase();
  const starts: number[] = [];
  for (let at = upper.indexOf(term); at >= 0; at = upper.indexOf(term, at + 1)) {
    if (at === 0 || WORD_BREAKS.includes(upper.charAt(at - 1))) starts.push(at);
  }
  return starts;
}

/** Whether `term`, already upper-cased, starts a word of any of the texts. */
export const matches = (term: string, texts: readonly string[]): boolean =>
  texts.some((text) => wordStarts(text, term).length > 0);

interface Piece {
  text: string;
  marked: boolean;
}

/** `text` in pieces that join back to it, the runs where a term starts a word marked. */
export function markedPieces(text: string, terms: readonly string[]): Piece[] {
  const marks = Array.from({ length: text.length }, () => false);
  for (const term of terms) {
    for (const at of wordStarts(text, term)) marks.fill(true, at, at + term.length);
  }
  const pieces: Piece[] = [];
  for (const [i, char] of text.split('').entries()) {
    const marked = marks[i] ?? false;
    const last = pieces.at(-1);
    if (last?.marked === marked) last.text += char;
    else pieces.push({ text: char, marked });
  }
  return pieces;
}

export interface TreeSearch {
  /** The items shown of each layer shown; a named layer without items shows with none. */
  layers: ReadonlyMap<ScopeLayer, readonly TreeItem[]>;
  /** The items a term names on their own row. */
  traced: readonly TreeItem[];
}

const ownTexts = ({ name, tag }: TreeItem): string[] => [name, tag];

/**
 * What the tree shows for the terms. A layer is named when every term matches its display name
 * or its group's title, and keeps all its items. Otherwise an item stays when each term matches
 * its name or tag, or the layer's or group's text. A layer shows when it is named or keeps items.
 */
export function searchTree(items: TreeItems, terms: readonly string[]): TreeSearch {
  const layers = new Map<ScopeLayer, readonly TreeItem[]>();
  const traced: TreeItem[] = [];
  for (const group of LAYER_GROUPS) {
    for (const layer of group.layers) {
      const around = [LAYER_TABLE[layer].name, group.title];
      const left = terms.filter((term) => !matches(term, around));
      const kept = itemsIn(items, layer).filter((item) =>
        left.every((term) => matches(term, ownTexts(item))),
      );
      if (left.length === 0 || kept.length > 0) layers.set(layer, kept);
      traced.push(...kept.filter((item) => terms.some((term) => matches(term, ownTexts(item)))));
    }
  }
  return { layers, traced };
}
