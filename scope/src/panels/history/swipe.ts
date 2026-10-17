/** The axis a finger moved `dx`, `dy` from where it landed goes along; none yet within `slop`, down on a tie. */
export function axisOf(dx: number, dy: number, slop: number): 'x' | 'y' | null {
  if (Math.hypot(dx, dy) <= slop) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/** How far a lane's top row stands off with a finger `dx` across it: it follows leftward only. */
export const swipeOffset = (dx: number): number => Math.min(0, dx);

/** Whether a swipe `dx` across a row `width` wide removes its lane: leftward past a third of it. */
export const swipeRemoves = (dx: number, width: number): boolean => -dx > width / 3;

/**
 * What a pointer moving along `axis` on a lane's top row does: a mouse or pen drags the lane
 * whichever way; a finger swipes it sideways and drags it up or down. Nothing yet without an axis.
 */
export function gestureOf(pointerType: string, axis: 'x' | 'y' | null): 'drag' | 'swipe' | null {
  if (axis === null) return null;
  return pointerType === 'touch' && axis === 'x' ? 'swipe' : 'drag';
}
