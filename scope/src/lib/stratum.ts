/** Vertical limits of an area part: what a published limit means in feet, and which stratum a part is. */

import type { ItemPart } from './chart';

const FLIGHT_LEVEL = /^FL(\d+)$/;

const MINUS = '−';
const EN_DASH = '–';

/** A published limit in feet: `SFC` and `GND` are 0, `UNL` is unbounded, `FLnnn` is nnn hundreds. */
export function limitFt(limit: string): number {
  if (limit === 'UNL') return Infinity;
  if (limit === 'SFC' || limit === 'GND') return 0;
  const level = FLIGHT_LEVEL.exec(limit);
  return level ? Number(level[1]) * 100 : parseInt(limit, 10);
}

/**
 * Whether an area part is an upper stratum: its lower limit is above the surface, as for the
 * upper sectors of a FIR. A part with no lower limit is not one.
 */
export function isUpperStratum({ properties: p }: ItemPart): boolean {
  return 'lower' in p && p.lower !== undefined && limitFt(p.lower) > 0;
}

/** A limit as a reader says it: a flight level by its number, any other as published. */
const written = (limit: string): string => FLIGHT_LEVEL.exec(limit)?.[1] ?? limit;

/** A part's lower limit as published; none is the surface. */
const lowerOf = ({ properties: p }: ItemPart): string =>
  ('lower' in p ? p.lower : undefined) ?? 'SFC';

/** A part's upper limit as published; none is unlimited. */
const upperOf = ({ properties: p }: ItemPart): string =>
  ('upper' in p ? p.upper : undefined) ?? 'UNL';

/** The limit among `limits` that wins against all the others by `order`, compared in feet. */
const extreme = (limits: string[], order: (a: number, b: number) => boolean): string =>
  limits.reduce((best, next) => (order(limitFt(next), limitFt(best)) ? next : best));

/** The band of an item's parts: the lowest lower and the highest upper limit, compared in feet. */
export function bandOf(parts: readonly ItemPart[]): { lower: string; upper: string } {
  return {
    lower: extreme(parts.map(lowerOf), (a, b) => a < b),
    upper: extreme(parts.map(upperOf), (a, b) => a > b),
  };
}

/**
 * A sector's stratum written as a tag: `335−` from the surface up to
 * a limit, `335+` from a limit to unlimited, `250–335` between two limits, and no tag for
 * surface to unlimited. The band runs from the lowest lower to the highest upper limit of the
 * parts, compared in feet.
 */
export function stratumTag(parts: readonly ItemPart[]): string {
  const { lower, upper } = bandOf(parts);
  const fromSurface = limitFt(lower) <= 0;
  const toUnlimited = limitFt(upper) === Infinity;
  if (fromSurface && toUnlimited) return '';
  if (fromSurface) return `${written(upper)}${MINUS}`;
  if (toUnlimited) return `${written(lower)}+`;
  return `${written(lower)}${EN_DASH}${written(upper)}`;
}
