import { RAD } from '../lib/units';

/** A number as an SVG attribute: a tenth of a pixel is precision enough. */
export const fixed = (n: number): string => n.toFixed(1);

/** A point `a` out from (x, y) along `deg` and `c` across it to the right, north up. */
export const offset =
  (x: number, y: number, deg: number) =>
  (a: number, c = 0): [number, number] => {
    const ux = Math.sin(deg * RAD);
    const uy = -Math.cos(deg * RAD);
    return [x + ux * a - uy * c, y + uy * a + ux * c];
  };

/** The same as an SVG pair. */
export const toward = (x: number, y: number, deg: number) => {
  const at = offset(x, y, deg);
  return (a: number, c = 0): string => at(a, c).map(fixed).join(' ');
};

/** A pair of coordinates: (x, y) in pixels, or (east, north) in NM. */
export type Point = readonly [number, number];

/** A number to a tenth of a pixel, as the drawing is. */
export const tenth = (n: number): number => Number(fixed(n));

/** A text set at (x, y). */
export interface TextLabel {
  text: string;
  x: number;
  y: number;
}

/** The subpath through `points`: a move to the first, a line to each next. */
export const polylinePath = (points: readonly Point[]): string =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${fixed(x)} ${fixed(y)}`).join('');

/** The closed subpath through `points`. */
export const polygonPath = (points: readonly Point[]): string => `${polylinePath(points)}Z`;
