/** The axis a finger moved `dx`, `dy` from where it landed goes along; none yet within `slop`, down on a tie. */
export function axisOf(dx: number, dy: number, slop: number): 'x' | 'y' | null {
  if (Math.hypot(dx, dy) <= slop) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/** How far a lane's top row stands off with a finger `dx` across it: it follows leftward only. */
export const swipeOffset = (dx: number): number => Math.min(0, dx);

/** Whether a swipe `dx` across a row `width` wide removes its lane: leftward past a third of it. */
export const swipeRemoves = (dx: number, width: number): boolean => -dx > width / 3;
