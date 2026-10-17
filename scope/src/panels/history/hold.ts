import { axisOf } from './swipe';

/** How long a finger rests on a lane's plot before it picks the lane up. */
export const HOLD_MS = 400;
/** How far a resting finger may stray and still hold: UIKit's long press allows 10 pt. */
export const HOLD_SLOP_PX = 10;

/**
 * What a pointer `dx`, `dy` from where it pressed on a lane's plot, `ms` after, does: a mouse or
 * pen drags the lane once past `slop`; a finger drags it once held within HOLD_SLOP_PX for
 * HOLD_MS, and one moved past that first is left to the page. Nothing yet otherwise.
 */
export function plotGestureOf(
  pointerType: string,
  dx: number,
  dy: number,
  ms: number,
  slop: number,
): 'drag' | 'pass' | null {
  if (pointerType !== 'touch') return axisOf(dx, dy, slop) === null ? null : 'drag';
  if (axisOf(dx, dy, HOLD_SLOP_PX) !== null) return 'pass';
  return ms >= HOLD_MS ? 'drag' : null;
}
