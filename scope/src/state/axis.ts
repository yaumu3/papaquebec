import type { Altimeter } from '../lib/altitude';
import { type Band, type BandLimits, formatEdge, fraction } from './band';

export interface AxisTick {
  at: number;
  label: string;
  /** A reference mark rather than a scale division. */
  minor?: boolean;
}

/** Scale marks from the bottom stop up, labelled the way the edge fields print. */
export function axisTicks(l: BandLimits, every: number): AxisTick[] {
  const out: AxisTick[] = [];
  for (let at = l.min; at <= l.max; at += every) out.push({ at, label: formatEdge(at, l) });
  return out;
}

/** The transition altitude in hundreds of feet, where the block regime changes. */
export function transitionLevel(a: Altimeter): number {
  return Math.round(a.transitionAltFt / 100);
}

/** The scale with the TA tick added; any label within `gap` of it gives way. */
export function scaleLabels(ticks: AxisTick[], ta: number, gap: number): AxisTick[] {
  const kept = ticks.filter((t) => Math.abs(t.at - ta) >= gap);
  return [...kept, { at: ta, label: 'TA', minor: true }].toSorted((a, b) => a.at - b.at);
}

export interface EdgeGeometry {
  /** Pixels the thumb centres can travel. */
  track: number;
  /** Height of an edge field, pixels. */
  field: number;
}

/** How far each edge field moves away from its thumb so the two never overlap. */
export function edgeSpread(b: Band, l: BandLimits, g: EdgeGeometry): number {
  const gap = (fraction(b.upper, l) - fraction(b.lower, l)) * g.track;
  return Math.max(0, (g.field - gap) / 2);
}
