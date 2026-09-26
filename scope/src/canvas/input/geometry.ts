import type { View } from '../../render/protocol';
import { toWorld } from '../../render/scene/view';
import { RANGE_MAX_NM, RANGE_MIN_NM } from '../../state/settingsDefaults';
import { pxPerNmFor } from '../view';

export interface Zoomed {
  rangeNm: number;
  pan: { x: number; y: number };
}

export interface Point {
  x: number;
  y: number;
}

/** A pointer that moves farther than this is dragging, not tapping. */
export const DRAG_THRESHOLD_PX = 5;

/** Scales the range by `factor` so the world point under screen (cx, cy) stays put. */
export function zoomAbout(
  v: View,
  rangeNm: number,
  cx: number,
  cy: number,
  factor: number,
): Zoomed {
  const next = Math.max(RANGE_MIN_NM, Math.min(RANGE_MAX_NM, rangeNm * factor));
  const before = toWorld(v, cx, cy);
  const after = toWorld({ ...v, pxPerNm: pxPerNmFor(v.widthPx, v.heightPx, next) }, cx, cy);
  return {
    rangeNm: next,
    pan: { x: v.centerX + before.x - after.x, y: v.centerY + before.y - after.y },
  };
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const gap = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Two fingers moving from `start` to `end`: the range shrinks as they spread, and the world
 * point that was under their midpoint follows the midpoint.
 */
export function pinchZoom(
  v: View,
  rangeNm: number,
  start: readonly [Point, Point],
  end: readonly [Point, Point],
): Zoomed {
  const factor = gap(...start) / Math.max(1, gap(...end));
  const m0 = mid(...start);
  const m1 = mid(...end);
  const zoomed = zoomAbout(v, rangeNm, m0.x, m0.y, factor);
  const k = pxPerNmFor(v.widthPx, v.heightPx, zoomed.rangeNm);
  return {
    rangeNm: zoomed.rangeNm,
    pan: { x: zoomed.pan.x - (m1.x - m0.x) / k, y: zoomed.pan.y + (m1.y - m0.y) / k },
  };
}

/** One finger dragging this far after a double tap halves or doubles the range. */
const DRAG_ZOOM_HALVING_PX = 150;

/**
 * A finger dragged `dy` px after a double tap: up zooms in, down zooms out, about `anchor`.
 */
export function dragZoom(v: View, rangeNm: number, anchor: Point, dy: number): Zoomed {
  return zoomAbout(v, rangeNm, anchor.x, anchor.y, 2 ** (dy / DRAG_ZOOM_HALVING_PX));
}
