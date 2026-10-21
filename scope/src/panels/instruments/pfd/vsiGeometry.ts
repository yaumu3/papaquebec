import { fixed, tenth, type TextLabel } from '../../svg';
import type { PfdGeometry } from './geometry';

const VSI_RANGE_FPM = 6000;
const VSI_HALF_MARGIN_PX = 14;
const VSI_SCALE_UNITS = 80;
/** The scale's slope, in units per fpm, up to 1000, up to 2000 and beyond, and where each starts. */
const VSI_SLOPES: readonly (readonly [number, number, number])[] = [
  [0, 0, 0.03],
  [1000, 30, 0.022],
  [2000, 52, 0.007],
];

/** The half-height of the vertical speed scale, on the tape's rows less a margin. */
const vsiHalf = (g: PfdGeometry): number => g.yc - g.yTop - VSI_HALF_MARGIN_PX;

/** How far a vertical rate stands from the centre line, up for a climb; the scale is nonlinear and capped. */
export function vsiOffset(g: PfdGeometry, vsFpm: number): number {
  const v = Math.min(Math.abs(vsFpm), VSI_RANGE_FPM);
  const [from, base, slope] = VSI_SLOPES.findLast(([start]) => v >= start) ?? [0, 0, 0];
  return Math.sign(vsFpm) * (vsiHalf(g) / VSI_SCALE_UNITS) * (base + (v - from) * slope);
}

/** Where a vertical rate stands on the scale. */
export const vsiY = (g: PfdGeometry, vsFpm: number): number => g.yc - vsiOffset(g, vsFpm);

const VSI_CHAMFER_IN_PX = 10;
const VSI_CHAMFER_SHORT_PX = 8;
const VSI_CHAMFER_LONG_PX = 14;
const VSI_RIGHT_INSET_PX = 1;

/** The strip behind the scale, its outer corners chamfered. */
export function vsiStripPath(g: PfdGeometry): string {
  const half = vsiHalf(g);
  const right = g.w - VSI_RIGHT_INSET_PX;
  const bend = g.w - VSI_CHAMFER_IN_PX;
  return (
    `M${fixed(g.vL)} ${fixed(g.yc - half - VSI_CHAMFER_SHORT_PX)}H${fixed(bend)}` +
    `L${fixed(right)} ${fixed(g.yc - half + VSI_CHAMFER_LONG_PX)}V${fixed(g.yc + half - VSI_CHAMFER_LONG_PX)}` +
    `L${fixed(bend)} ${fixed(g.yc + half + VSI_CHAMFER_SHORT_PX)}H${fixed(g.vL)}Z`
  );
}

const VSI_MARKS_FPM: readonly number[] = [500, 1000, 1500, 2000, 4000, 6000];
const VSI_LABELLED_FPM: ReadonlySet<number> = new Set([1000, 2000, 6000]);
const VSI_TICKS_FROM_PX = 10;
const VSI_ZERO_PX = 7;
const VSI_LONG_TICK_PX = 5;
const VSI_SHORT_TICK_PX = 3;
const VSI_LABEL_GAP_PX = 2;

export interface VsiScale {
  ticks: string;
  labels: TextLabel[];
}

/** The zero mark, the ticks at ±500 to ±6000 fpm and the labels of thousands, 1, 2 and 6. */
export function vsiScale(g: PfdGeometry): VsiScale {
  const x = g.vL + VSI_TICKS_FROM_PX;
  const out: VsiScale = { ticks: `M${fixed(x)} ${fixed(g.yc)}h${VSI_ZERO_PX}`, labels: [] };
  for (const mark of VSI_MARKS_FPM) {
    const labelled = VSI_LABELLED_FPM.has(mark);
    for (const v of [mark, -mark]) {
      const y = vsiY(g, v);
      out.ticks += `M${fixed(x)} ${fixed(y)}h${labelled ? VSI_LONG_TICK_PX : VSI_SHORT_TICK_PX}`;
      if (labelled) {
        out.labels.push({ text: String(mark / 1000), x: g.vL + VSI_LABEL_GAP_PX, y: tenth(y) });
      }
    }
  }
  return out;
}

const VSI_NEEDLE_TIP_PX = 2;
const VSI_PIVOT_PX = 70;
const VSI_NEEDLE_CUT_PX = 3;

/** The needle, from the scale towards a pivot off the right edge at the centre line, cut short of the edge. */
export function vsiNeedlePath(g: PfdGeometry, vsFpm: number): string {
  const tipX = g.vL + VSI_TICKS_FROM_PX + VSI_NEEDLE_TIP_PX;
  const tipY = vsiY(g, vsFpm);
  const pivotX = g.w + VSI_PIVOT_PX;
  const k = (g.w - VSI_NEEDLE_CUT_PX - tipX) / (pivotX - tipX);
  const endY = tipY + (g.yc - tipY) * k;
  return `M${fixed(tipX)} ${fixed(tipY)}L${fixed(g.w - VSI_NEEDLE_CUT_PX)} ${fixed(endY)}`;
}

const VSI_DIGITS_FROM_FPM = 400;
const VSI_DIGITS_STEP_FPM = 50;
const VSI_DIGITS_RISE_PX = 18;
const VSI_DIGITS_RIGHT_INSET_PX = 2;

/** The rate to 50 fpm from 400, right-aligned above the strip for a climb and below it for a descent. */
export function vsiDigits(g: PfdGeometry, vsFpm: number): TextLabel | undefined {
  if (Math.abs(vsFpm) < VSI_DIGITS_FROM_FPM) return undefined;
  const rounded = Math.abs(Math.round(vsFpm / VSI_DIGITS_STEP_FPM) * VSI_DIGITS_STEP_FPM);
  const reach = vsiHalf(g) + VSI_DIGITS_RISE_PX;
  return {
    text: String(rounded),
    x: g.w - VSI_DIGITS_RIGHT_INSET_PX,
    y: vsFpm > 0 ? g.yc - reach : g.yc + reach,
  };
}
