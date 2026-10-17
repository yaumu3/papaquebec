import { clamp } from '../../lib/math';

/** The slot a dragged lane from `from` shows while over `slot`: over the bin, the place it left. */
export const slotShown = (from: number, slot: number, overBin: boolean): number =>
  overBin ? from : slot;

/** What a dragged lane released does: removed over the bin, else moved from its place to the slot. */
export const dropOf = (
  from: number,
  slot: number,
  overBin: boolean,
): 'remove' | { move: number; to: number } => (overBin ? 'remove' : { move: from, to: slot });

/**
 * The left of the chip lifted with a dragged lane, `x` being the pointer across a bay `width`
 * wide: where it was taken hold of, `grabX` to the right of the chip's left, kept whole inside.
 */
export const liftLeft = (x: number, grabX: number, width: number, chipWidth: number): number =>
  clamp(x - grabX, 0, Math.max(0, width - chipWidth));

/** An element's box in the viewport, CSS px. */
export type Box = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;

const inside = (x: number, y: number, b: Box): boolean =>
  x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;

/** Whether a pointer at `x`, `y` is over the bin, counted only where `view`, the lanes' scroll, shows it. */
export const overBin = (x: number, y: number, bin: Box, view: Box): boolean =>
  inside(x, y, bin) && inside(x, y, view);
