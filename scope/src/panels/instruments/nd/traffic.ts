import type { Track } from '../../../state/track';
import { holdsAll } from '../freshness';

/** The vertical speed in fpm from which TCAS shows a vertical arrow beside traffic (RTCA DO-185B). */
const ARROW_FPM = 500;

/**
 * The altitude of traffic relative to own ship in hundreds of feet, signed by the rounded value
 * so that level reads `+00`, at least two digits and never clipped. Halves round away from zero.
 */
export function relativeAltitudeLabel(deltaFt: number): string {
  const hundreds = Math.round(Math.abs(deltaFt) / 100);
  const sign = deltaFt < 0 && hundreds > 0 ? '-' : '+';
  return `${sign}${String(hundreds).padStart(2, '0')}`;
}

/** The arrow for traffic climbing or descending at 500 fpm or more by its own held rate. */
export function verticalArrow(t: Track, now: number): '↑' | '↓' | undefined {
  const rate = t.verticalRate;
  if (rate === undefined || Math.abs(rate) < ARROW_FPM || !holdsAll(t, ['verticalRate'], now)) {
    return undefined;
  }
  return rate > 0 ? '↑' : '↓';
}
