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
