import { createEffect, createSignal, onCleanup } from 'solid-js';

import { isMouse } from '../canvas/input/devices/mouse';
import { hexAt, type HoverSurface, setHovered } from '../state/scope';

/**
 * Hovers as `by` what the place under the mouse shows now, following it through every change of
 * `hexes`; a surface holds the place, never the aircraft.
 */
export function hoverPlace(by: HoverSurface, hexes: () => readonly string[]) {
  const [place, setPlace] = createSignal<number | null>(null);
  createEffect(() => setHovered(by, hexAt(hexes(), place())));
  onCleanup(() => setHovered(by, null));
  const drop = (i: number) => setPlace((p) => (p === i ? null : p));
  return {
    place,
    /** The mouse handlers of the element at place `i`; called at the top of its `<Index>` child. */
    at: (i: number) => {
      onCleanup(() => drop(i));
      return {
        enter: (e: Pick<PointerEvent, 'pointerType'>) => isMouse(e) && setPlace(i),
        leave: (e: Pick<PointerEvent, 'pointerType'>) => isMouse(e) && drop(i),
      };
    },
  };
}
