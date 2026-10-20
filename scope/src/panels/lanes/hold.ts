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
  const g = touchHoldOf('pressed', part, dx, dy, ms);
  return g === 'lift' ? 'drag' : g === 'swipe' || g === 'pass' ? g : null;
}

/** How long a finger holds a lifted lane, from its press, for its picker. */
export const MENU_HOLD_MS = 900;

/** Where a finger's hold on a lane has got to: resting, lifted in place, or with the picker open. */
export type TouchStage = 'pressed' | 'lifted' | 'picker';

/**
 * What a finger `dx`, `dy` from its press on a lane's `part`, `ms` after, does at a `stage`. Resting,
 * it lifts the lane at HOLD_MS; lifted and held within HOLD_SLOP_PX it opens the picker at
 * MENU_HOLD_MS; moved past that after the lift it drags the lane. Moved first, it swipes the row
 * sideways, or is left to the page.
 */
export function touchHoldOf(
  stage: TouchStage,
  part: LanePart,
  dx: number,
  dy: number,
  ms: number,
): 'lift' | 'picker' | 'drag' | 'swipe' | 'pass' | null {
  const axis = axisOf(dx, dy, HOLD_SLOP_PX);
  if (stage !== 'pressed') {
    if (axis !== null) return 'drag';
    return stage === 'lifted' && ms >= MENU_HOLD_MS ? 'picker' : null;
  }
  if (axis === null) return ms >= HOLD_MS ? 'lift' : null;
  return part === 'row' && axis === 'x' ? 'swipe' : 'pass';
}
