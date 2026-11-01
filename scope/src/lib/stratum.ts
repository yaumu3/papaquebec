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

/**
 * A limit in hundreds of feet as a chart prints it: three digits, `SFC` for the surface, `UNL`
 * for unlimited. The digits come from the limit in feet; ` AGL` is kept as filed.
 */
export function limitInHundreds(limit: string): string {
  const ft = limitFt(limit);
  if (ft === Infinity) return 'UNL';
  if (ft <= 0) return 'SFC';
  const digits = String(Math.round(ft / 100)).padStart(3, '0');
  return limit.endsWith(' AGL') ? `${digits} AGL` : digits;
}

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

/** Whether a part files a limit, above or below. */
const hasLimit = ({ properties: p }: ItemPart): boolean =>
  ('lower' in p && p.lower !== undefined) || ('upper' in p && p.upper !== undefined);

/**
 * The item's band as the fraction a chart prints, upper over lower, each in hundreds of feet.
 * None when no part files a limit.
 */
export function fractionOf(
  parts: readonly ItemPart[],
): { upper: string; lower: string } | undefined {
  if (!parts.some(hasLimit)) return undefined;
  const { lower, upper } = bandOf(parts);
  return { upper: limitInHundreds(upper), lower: limitInHundreds(lower) };
}

/**
 * A sector's stratum written as a tag: `335−` from the surface up to
 * a limit, `335+` from a limit to unlimited, `250–335` between two limits, and no tag for
 * surface to unlimited, over the item's band (`bandOf`).
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
