/** Operator-entered altimeter setting. */
import { HPA_PER_INHG } from './units';
export interface Altimeter {
  /** Below this the scope shows QNH altitude; at or above, flight level. Feet. */
  transitionAltFt: number;
  qnhInHg: number;
}

const STANDARD_QNH_INHG = 29.92;
export const STANDARD_ALTIMETER: Altimeter = { transitionAltFt: 14000, qnhInHg: STANDARD_QNH_INHG };

/** ISA near sea level: 27.3 ft per hPa, 33.864 hPa per inHg. */
const FT_PER_INHG = 27.3 * HPA_PER_INHG;

/** ADS-B altitude is pressure altitude on 29.92; shift it to the local QNH. */
export function qnhAltitudeFt(pressureAltFt: number, qnhInHg: number): number {
  return Math.round(pressureAltFt + (qnhInHg - STANDARD_QNH_INHG) * FT_PER_INHG);
}

export type DisplayAltitude =
  | { kind: 'altitude'; feet: number }
  | { kind: 'level'; feet: number }
  | { kind: 'ground' }
  | { kind: 'unknown' };

export function displayAltitude(alt: number | 'ground' | undefined, a: Altimeter): DisplayAltitude {
  if (alt === undefined) return { kind: 'unknown' };
  if (alt === 'ground') return { kind: 'ground' };
  const corrected = qnhAltitudeFt(alt, a.qnhInHg);
  return corrected < a.transitionAltFt
    ? { kind: 'altitude', feet: corrected }
    : { kind: 'level', feet: alt };
}

/** Three digits of hundreds of feet in whichever regime applies. */
export function formatAltitude(alt: number | 'ground' | undefined, a: Altimeter): string {
  const d = displayAltitude(alt, a);
  if (d.kind === 'unknown') return '---';
  if (d.kind === 'ground') return 'GND';
  return String(Math.max(0, Math.round(d.feet / 100))).padStart(3, '0');
}
