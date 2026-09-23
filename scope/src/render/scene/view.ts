import type { View } from '../protocol';

/** World NM to CSS px on the canvas, y down. */
export function toScreen(view: View, x: number, y: number): { cx: number; cy: number } {
  return {
    cx: view.widthPx / 2 + (x - view.centerX) * view.pxPerNm,
    cy: view.heightPx / 2 - (y - view.centerY) * view.pxPerNm,
  };
}

export function toWorld(view: View, cx: number, cy: number): { x: number; y: number } {
  return {
    x: view.centerX + (cx - view.widthPx / 2) / view.pxPerNm,
    y: view.centerY - (cy - view.heightPx / 2) / view.pxPerNm,
  };
}
