/**
 * Searching the tree: a query is upper-cased terms, and a term matches a text when it starts one
 * of the text's words.
 */

import { LAYER_GROUPS, LAYER_TABLE } from './layers';
import type { ScopeLayer } from './mapsetFormat';
import { itemsIn, type TreeItem, type TreeItems } from './treeItems';

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
