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

/** Moves the lower edge, pushing the upper edge ahead of it when they would get too close. */
export function withLower(b: Band, lower: number, l: BandLimits): Band {
  return { lower, upper: Math.max(b.upper, Math.min(l.max, lower + l.gap)) };
}

/** Moves the upper edge, pushing the lower edge ahead of it when they would get too close. */
export function withUpper(b: Band, upper: number, l: BandLimits): Band {
  return { lower: Math.min(b.lower, Math.max(l.min, upper - l.gap)), upper };
}
