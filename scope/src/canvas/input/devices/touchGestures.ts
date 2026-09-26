import type { Point } from '../geometry';

export type Pair = [Point, Point];

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const gap = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Two fingers moving from `start` to `now`: the range shrinks as they spread, about their first
 * midpoint, which follows their current one.
 */
export function pinchOf(
  start: readonly [Point, Point],
  now: readonly [Point, Point],
): { anchor: Point; factor: number; to: Point } {
  return {
    anchor: mid(...start),
    factor: gap(...start) / Math.max(1, gap(...now)),
    to: mid(...now),
  };
}

/** One finger dragging this far after a double tap halves or doubles the range. */
const DRAG_ZOOM_HALVING_PX = 150;

/** The zoom for a finger dragged `dy` px after a double tap: up zooms in, down zooms out. */
export function dragZoomFactor(dy: number): number {
  return 2 ** (dy / DRAG_ZOOM_HALVING_PX);
}

/** A second touch this soon and this close to a tap makes a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 40;

export interface Tap extends Point {
  /** Event time in ms. */
  t: number;
}

/** Whether a touch-down at `down` is the second half of a double tap after `tap`. */
export function isDoubleTap(tap: Tap | null, down: Tap): boolean {
  return (
    tap !== null &&
    down.t - tap.t <= DOUBLE_TAP_MS &&
    Math.hypot(down.x - tap.x, down.y - tap.y) <= DOUBLE_TAP_PX
  );
}
