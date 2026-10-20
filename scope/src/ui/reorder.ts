import { clamp } from '../lib/math';

/** The slot of items `heights` tall, one under another, that a pointer `y` down them is over. */
export function slotAt(y: number, heights: readonly number[]): number {
  let bottom = 0;
  const slot = heights.findIndex((h) => y < (bottom += h));
  return slot < 0 ? Math.max(heights.length - 1, 0) : slot;
}

/** Where item `i` stands while the item at `from` is held over `slot`, the others closed up round it. */
export function placeOf(i: number, from: number, slot: number): number {
  if (i === from) return slot;
  if (from < slot && i > from && i <= slot) return i - 1;
  if (slot < from && i >= slot && i < from) return i + 1;
  return i;
}

/** How near an edge of a scrolling view a dragging pointer starts to scroll it. */
export const EDGE_PX = 24;
/** The fastest it scrolls, at the edge or past it, px a frame. */
export const EDGE_SPEED_PX = 12;

/** How fast a pointer `depth` inside an edge scrolls the view, px a frame: faster the nearer the edge. */
const edgePull = (depth: number): number =>
  (clamp(EDGE_PX - depth, 0, EDGE_PX) / EDGE_PX) * EDGE_SPEED_PX;

/** How far a view from `top` to `bottom` scrolls a frame with a dragging pointer at `y`: up near the top, down near the bottom. */
export function edgeSpeed(y: number, top: number, bottom: number): number {
  return edgePull(bottom - y) - edgePull(y - top);
}

/** What a key asks of a reorderable item: a place up or down with Alt, or its removal; null for any other. */
export function reorderKey(e: { key: string; altKey: boolean }): 'up' | 'down' | 'remove' | null {
  if (e.altKey) return e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : null;
  return e.key === 'Delete' || e.key === 'Backspace' ? 'remove' : null;
}
