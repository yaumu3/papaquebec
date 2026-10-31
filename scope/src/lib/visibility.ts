/**
 * Which items of a layer are shown. A layer keeps its mode, shown or hidden, and the keys of the
 * items that go against it; an item is shown when exactly one of the two says so.
 */

export interface LayerState {
  mode: boolean;
  /** Keys of the items that go against the mode. */
  exceptions: ReadonlySet<string>;
}

export const NO_EXCEPTIONS: ReadonlySet<string> = new Set();

/** The most exceptions a layer stores; beyond it keys of items not in the chart are dropped. */
const EXCEPTIONS_MAX = 2000;

export const isItemShown = ({ mode, exceptions }: LayerState, key: string): boolean =>
  mode !== exceptions.has(key);

/** Every item of a layer, now and later, shown or hidden. */
export const everyItemSet = (on: boolean): LayerState => ({
  mode: on,
  exceptions: NO_EXCEPTIONS,
});

/**
 * The exceptions with keys of items not in the chart dropped, oldest first, while over `max`.
 * Keys of items in the chart are never dropped, so the result may stay over `max`.
 */
export function capped(
  exceptions: ReadonlySet<string>,
  present: ReadonlySet<string>,
  max = EXCEPTIONS_MAX,
): ReadonlySet<string> {
  if (exceptions.size <= max) return exceptions;
  const kept = new Set(exceptions);
  for (const key of exceptions) {
    if (kept.size <= max) break;
    if (!present.has(key)) kept.delete(key);
  }
  return kept;
}

/**
 * The layer after the items `keys` are shown (`on`) or hidden. When every item of the chart then
 * goes against the mode, the mode flips and the exceptions clear. `present` holds the keys of
 * the layer's items in the chart and is never empty.
 */
export function itemsSetTo(
  { mode, exceptions }: LayerState,
  keys: readonly string[],
  on: boolean,
  present: readonly string[],
  max = EXCEPTIONS_MAX,
): LayerState {
  const next = new Set(exceptions);
  for (const key of keys) {
    next.delete(key);
    if (on !== mode) next.add(key);
  }
  if (present.every((key) => next.has(key))) return everyItemSet(!mode);
  return { mode, exceptions: capped(next, new Set(present), max) };
}
