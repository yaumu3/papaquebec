import { type Altimeter, displayLevel } from '../lib/altitude';
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

const binCount = (l: BandLimits, bin: number) => Math.ceil((l.max - l.min) / bin);

/** Which profile bin a level falls in; anything past the top stop lands in the last. */
export function binIndex(level: number, l: BandLimits, bin: number): number {
  return Math.min(binCount(l, bin) - 1, Math.max(0, Math.floor((level - l.min) / bin)));
}

/**
 * Airborne targets per bin of the value their blocks show, from the bottom stop up;
 * a target above the top stop lands in the last bin. Ground and unknown count nowhere.
 */
export function altitudeProfile(
  tracks: Iterable<{ alt: number | 'ground' | undefined }>,
  a: Altimeter,
  l: BandLimits,
  bin: number,
): number[] {
  const out = Array.from({ length: binCount(l, bin) }, () => 0);
  for (const t of tracks) {
    const level = displayLevel(t.alt, a);
    if (typeof level !== 'number') continue;
    const k = binIndex(level, l, bin);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Targets reporting on the ground: the bin below the scale. */
export function groundCount(tracks: Iterable<{ alt: number | 'ground' | undefined }>): number {
  let n = 0;
  for (const t of tracks) if (t.alt === 'ground') n += 1;
  return n;
}
