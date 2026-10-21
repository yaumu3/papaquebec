import type { LanePart } from './laneDrag';
import { axisOf } from './swipe';

/** How long a finger rests on a lane before it picks the lane up. */
export const HOLD_MS = 400;
/** How far a resting finger may stray and still hold: UIKit's long press allows 10 pt. */
export const HOLD_SLOP_PX = 10;

/**
 * What a pointer `dx`, `dy` from where it pressed on a lane's `part`, `ms` after, does: a mouse or
 * pen, once past `slop`, selects a span of a history lane if it moved sideways first and drags the
 * lane otherwise (an instrument's any way); a finger drags it once held within HOLD_SLOP_PX for
 * HOLD_MS, by the row or the plot alike. A finger moved past that first swipes the row sideways
 * or peeks along a plot, and is otherwise left to the page. Nothing yet otherwise.
 */
export function laneGestureOf(
  part: LanePart,
  pointerType: string,
  dx: number,
  dy: number,
  ms: number,
  slop: number,
): 'drag' | 'select' | 'peek' | 'swipe' | 'pass' | null {
  if (pointerType !== 'touch') {
    const axis = axisOf(dx, dy, slop);
    return axis === 'x' && part !== 'instrument' ? 'select' : axis === null ? null : 'drag';
  }
  const g = touchHoldOf('pressed', part, dx, dy, ms);
  return g === 'lift' ? 'drag' : g === 'swipe' || g === 'pass' || g === 'peek' ? g : null;
}

/** How long a finger holds a lifted lane, from its press, for its picker. */
export const PICKER_HOLD_MS = 900;

/** Where a finger's hold on a lane has got to: resting, lifted in place, or with the picker open. */
export type TouchStage = 'pressed' | 'lifted' | 'picker';

/**
 * What a finger `dx`, `dy` from its press on a lane's `part`, `ms` after, does at a `stage`. Resting,
 * it lifts the lane at HOLD_MS; lifted and held within HOLD_SLOP_PX it opens the picker at
 * PICKER_HOLD_MS; moved past that after the lift it drags the lane. Moved sideways first, it swipes
 * the row or peeks along a plot; moved otherwise, it is left to the page.
 */
export function touchHoldOf(
  stage: TouchStage,
  part: LanePart,
  dx: number,
  dy: number,
  ms: number,
): 'lift' | 'picker' | 'drag' | 'peek' | 'swipe' | 'pass' | null {
  const axis = axisOf(dx, dy, HOLD_SLOP_PX);
  if (stage !== 'pressed') {
    if (axis !== null) return 'drag';
    return stage === 'lifted' && ms >= PICKER_HOLD_MS ? 'picker' : null;
  }
  if (axis === null) return ms >= HOLD_MS ? 'lift' : null;
  if (axis !== 'x') return 'pass';
  return part === 'row' ? 'swipe' : part === 'plot' ? 'peek' : 'pass';
}

/**
 * Whether a second finger landing now pinches the window: while the first rests or peeks on a
 * history lane's `part`, not once it has dragged, swiped or opened the picker.
 */
export const pinchesFrom = (
  g: { holding: boolean; peeking: boolean; drag: boolean; swipe: boolean; picking: boolean },
  part: LanePart | null,
): boolean =>
  (g.holding || g.peeking) &&
  !g.drag &&
  !g.swipe &&
  !g.picking &&
  part !== null &&
  part !== 'instrument';

/**
 * What a finger's move over the lanes is kept from: scrolling, once it drags, swipes, peeks or
 * picks; the sheet, from the press on a lane until the finger lifts.
 */
export function keepsTouch(g: {
  drag: boolean;
  swipe: boolean;
  holding: boolean;
  picking: boolean;
  peek: boolean;
}): {
  prevent: boolean;
  stop: boolean;
} {
  const prevent = g.drag || g.swipe || g.picking || g.peek;
  return { prevent, stop: prevent || g.holding };
}

/** How soon, and how near, a second tap must follow the first to be a double tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 24;

/** A tap: where it was, in viewport px, and when, in ms. */
export interface Tap {
  x: number;
  y: number;
  at: number;
}

/** Whether `tap` follows `prev` closely enough in time and place to make a double tap with it. */
export const isDoubleTap = (prev: Tap | null, tap: Tap): boolean =>
  prev !== null &&
  tap.at - prev.at <= DOUBLE_TAP_MS &&
  Math.hypot(tap.x - prev.x, tap.y - prev.y) <= DOUBLE_TAP_PX;
