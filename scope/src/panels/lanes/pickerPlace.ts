import { clamp } from '../../lib/math';
import type { Box } from './drag';

/** What asked for a lane's palette. */
type ContextSource = 'keyboard' | 'touch' | 'mouse';

/** Where a palette is anchored: its top-left at the point, or its bottom-left when it opens up. */
export interface PickerAnchor {
  x: number;
  y: number;
  up: boolean;
}

/** What made a click: a key press clicks with no detail; a pointer with one. */
export function clickSourceOf(detail: number): 'keyboard' | 'pointer' {
  return detail === 0 ? 'keyboard' : 'pointer';
}

/** Where + LANE opens its palette: upward from the click, or from its own top-left when it is pressed with a key. */
export function addPickerAnchor(
  source: 'keyboard' | 'pointer',
  x: number,
  y: number,
  button: Box,
): PickerAnchor {
  return source === 'keyboard' ? { x: button.left, y: button.top, up: true } : { x, y, up: true };
}

/**
 * Where a palette of `size` stands in `view`: at its anchor, on the other side of the point or the
 * left of it where it would pass an edge, then kept whole inside the view.
 */
export function pickerBox(
  anchor: PickerAnchor,
  size: { width: number; height: number },
  view: { width: number; height: number },
): { left: number; top: number } {
  const down = anchor.y;
  const up = anchor.y - size.height;
  const first = anchor.up ? up : down;
  const fits = first >= 0 && first + size.height <= view.height;
  const top = fits ? first : anchor.up ? down : up;
  const left = anchor.x + size.width > view.width ? anchor.x - size.width : anchor.x;
  return {
    left: clamp(left, 0, Math.max(0, view.width - size.width)),
    top: clamp(top, 0, Math.max(0, view.height - size.height)),
  };
}

/**
 * What asked for a lane's menu. The menu key fires `contextmenu` with button -1; a press that
 * began with a finger is a touch, which the hold answers; any other press is a mouse or pen.
 */
export function contextSourceOf(button: number, pressed: string | null): ContextSource {
  if (button === -1) return 'keyboard';
  return pressed === 'touch' ? 'touch' : 'mouse';
}

/** Where a lane's palette opens: at the pointer, from the lane's top-left when asked by key, never for a finger. */
export function lanePickerAnchor(
  source: ContextSource,
  x: number,
  y: number,
  lane: Box,
): PickerAnchor | null {
  if (source === 'touch') return null;
  return source === 'keyboard' ? { x: lane.left, y: lane.top, up: false } : { x, y, up: false };
}

/** Shift+F10, the menu key where macOS Chromium has none to press. */
export const isPickerKey = (e: { key: string; shiftKey: boolean }): boolean =>
  e.shiftKey && e.key === 'F10';
