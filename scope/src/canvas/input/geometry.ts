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

/** Scales about `anchor`, then pans so the world point that was under it sits under `to`. */
export function zoomMoving(
  v: View,
  rangeNm: number,
  anchor: Point,
  factor: number,
  to: Point,
): Zoomed {
  const zoomed = zoomAbout(v, rangeNm, anchor.x, anchor.y, factor);
  const k = pxPerNmFor(v.widthPx, v.heightPx, zoomed.rangeNm);
  return {
    rangeNm: zoomed.rangeNm,
    pan: { x: zoomed.pan.x - (to.x - anchor.x) / k, y: zoomed.pan.y + (to.y - anchor.y) / k },
  };
}
