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

/** The part of `a` inside `b`; empty, never inverted, where they do not meet. */
export function clipBox(a: Box, b: Box): Box {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  return {
    left,
    top,
    right: Math.max(left, Math.min(a.right, b.right)),
    bottom: Math.max(top, Math.min(a.bottom, b.bottom)),
  };
}

const inside = (x: number, y: number, b: Box): boolean =>
  x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;

/** Whether a pointer at `x`, `y` is over the bin, counted only where `view`, the lanes' scroll, shows it. */
export const overBin = (x: number, y: number, bin: Box, view: Box): boolean =>
  inside(x, y, bin) && inside(x, y, view);

/** What a key pressed while a pointer has hold of a lane does: Esc lets go of it; any other is kept from the page. */
export const dragKeyOf = (key: string): 'cancel' | 'keep' => (key === 'Escape' ? 'cancel' : 'keep');
