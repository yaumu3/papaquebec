import { clamp } from '../lib/math';

/**
 * Tells where a lane dragged by its grip goes as the pointer travels: a place for every lane
 * pitch crossed, one move at a time, each from where the lane is by then.
 */
export function trackReorder(move: (from: number, to: number) => void) {
  let at = 0;
  let y0 = 0;
  let pitch = 1;
  let count = 1;
  return {
    /** The lane at `index` is taken hold of at `y`, among `n` lanes `pitchPx` apart. */
    down(index: number, y: number, pitchPx: number, n: number): void {
      at = index;
      y0 = y;
      pitch = pitchPx;
      count = n;
    },
    move(y: number): void {
      const to = clamp(at + Math.round((y - y0) / pitch), 0, count - 1);
      if (to === at) return;
      move(at, to);
      y0 += (to - at) * pitch;
      at = to;
    },
  };
}
