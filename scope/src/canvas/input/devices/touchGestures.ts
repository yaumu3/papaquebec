import type { Point } from '../geometry';

export type Pair = [Point, Point];

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
