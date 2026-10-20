import type { LanePart } from './laneDrag';
import { axisOf } from './swipe';

/** How long a finger rests on a lane before it picks the lane up. */
export const HOLD_MS = 400;
/** How far a resting finger may stray and still hold: UIKit's long press allows 10 pt. */
export const HOLD_SLOP_PX = 10;

/**
 * What a pointer `dx`, `dy` from where it pressed on a lane's `part`, `ms` after, does: a mouse or
 * pen drags the lane once past `slop`; a finger drags it once held within HOLD_SLOP_PX for
 * HOLD_MS, by the row or the plot alike. A finger moved past that first swipes the row sideways,
 * and is otherwise left to the page. Nothing yet otherwise.
 */
export function laneGestureOf(
  part: LanePart,
  pointerType: string,
  dx: number,
  dy: number,
  ms: number,
  slop: number,
): 'drag' | 'swipe' | 'pass' | null {
  if (pointerType !== 'touch') return axisOf(dx, dy, slop) === null ? null : 'drag';
  const axis = axisOf(dx, dy, HOLD_SLOP_PX);
  if (axis === null) return ms >= HOLD_MS ? 'drag' : null;
  return part === 'row' && axis === 'x' ? 'swipe' : 'pass';
}
