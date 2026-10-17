/** The index after `i` of `count` round a ring, or before it when `back`; from outside it, the first or the last. */
export function wrapIndex(i: number, count: number, back: boolean): number {
  if (i < 0) return back ? count - 1 : 0;
  return (i + (back ? count - 1 : 1)) % count;
}
