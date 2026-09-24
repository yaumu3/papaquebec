/** A closed range of slider positions; the two edges never cross. */
export interface Band {
  lower: number;
  upper: number;
}

export interface BandLimits {
  min: number;
  max: number;
  /** Least distance kept between the edges. */
  gap: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Moves the lower edge, pushing the upper edge ahead of it when they would get too close. */
export function withLower(b: Band, lower: number, l: BandLimits): Band {
  const v = clamp(lower, l.min, l.max - l.gap);
  return { lower: v, upper: Math.max(b.upper, v + l.gap) };
}

/** Moves the upper edge, pushing the lower edge ahead of it when they would get too close. */
export function withUpper(b: Band, upper: number, l: BandLimits): Band {
  const v = clamp(upper, l.min + l.gap, l.max);
  return { lower: Math.min(b.lower, v - l.gap), upper: v };
}

const UNLIMITED = 'UNL';

/** Three digits as a data block prints them; the upper stop reads as unlimited. */
export function formatEdge(v: number, l: BandLimits): string {
  return v >= l.max ? UNLIMITED : String(v).padStart(3, '0');
}

/** Up to three digits within the limits, or UNL; anything else is null. */
export function parseEdge(text: string, l: BandLimits): number | null {
  const t = text.trim().toUpperCase();
  if (t === UNLIMITED) return l.max;
  if (!/^\d{1,3}$/.test(t)) return null;
  const v = Number(t);
  return v >= l.min && v <= l.max ? v : null;
}
