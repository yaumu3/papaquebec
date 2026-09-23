import { createMemo } from 'solid-js';

import type { View } from '../render/protocol';
import { canvasSize, pan } from '../state/scope';
import { settings } from '../state/settings';

/** The range ring for the selected range fits inside the shorter canvas edge with a margin. */
const RANGE_FILL = 0.92;

export function pxPerNmFor(width: number, height: number, rangeNm: number): number {
  return ((Math.min(width, height) / 2) * RANGE_FILL) / rangeNm;
}

export function createView(): () => View {
  return createMemo<View>(() => {
    const { width, height, dpr } = canvasSize();
    const p = pan();
    return {
      centerX: p.x,
      centerY: p.y,
      pxPerNm: pxPerNmFor(width, height, settings.rangeNm),
      widthPx: width,
      heightPx: height,
      dpr,
    };
  });
}
