/** The room test for a label: shown when there is room, with a margin so it does not flicker. */

/** How much more than its threshold a hidden label needs to show again. */
const SHOW_RATIO = 1.1;

/** Whether each label, by key, was shown the last time it was tested. */
export type ShownMemory = Map<string, boolean>;

/**
 * Whether a label with `threshold` fits in `room`: shown from `threshold` × `SHOW_RATIO` up and
 * hidden below `threshold`. In between it keeps `wasShown`; with no past state it is shown from
 * `threshold`.
 */
export function fits(room: number, threshold: number, wasShown?: boolean): boolean {
  // A ratio: 100 * 1.1 rounds above 110, so the product would miss the bound exactly.
  if (room / threshold >= SHOW_RATIO) return true;
  if (room < threshold) return false;
  return wasShown ?? true;
}

/** `fits` for the label under `key`, reading its last state and writing the new one. */
export function rememberFits(
  memory: ShownMemory,
  key: string,
  room: number,
  threshold: number,
): boolean {
  const shown = fits(room, threshold, memory.get(key));
  memory.set(key, shown);
  return shown;
}
