export type ClimbState = 'climbing' | 'descending' | 'level';

const CLIMB_DEAD_BAND_FPM = 200;

export function climbState(baroRate: number | undefined): ClimbState {
  if (baroRate === undefined) return 'level';
  if (baroRate > CLIMB_DEAD_BAND_FPM) return 'climbing';
  if (baroRate < -CLIMB_DEAD_BAND_FPM) return 'descending';
  return 'level';
}

export function climbArrow(baroRate: number | undefined): string {
  switch (climbState(baroRate)) {
    case 'climbing':
      return '↑';
    case 'descending':
      return '↓';
    default:
      return ' ';
  }
}

/**
 * Wake letter from the ADS-B emitter category. The categories are defined in RTCA DO-260B
 * §2.2.3.2.5.2 (ICAO Annex 10 Vol. IV): A1 light < 15 500 lb, A2 small to 75 000 lb, A3 large
 * to 300 000 lb, A4 high-vortex large (B757), A5 heavy above, A6 high performance (> 5 g and
 * > 400 kt), A7 rotorcraft, B1 glider, B2 lighter-than-air, B4 ultralight, B6 UAV. The wake
 * classes are ICAO Doc 4444 PANS-ATM §4.9.1: L up to 7 000 kg, M to 136 000 kg, H above; the
 * A1–A5 bands fall on the same limits. A6 is taken as the fighter class, medium, an inference
 * from performance rather than weight. A7 and B2 span light and medium and, like A0 and B6,
 * say nothing.
 */
export function wakeLetter(category: string | undefined): string {
  switch (category) {
    case 'A1':
    case 'B1':
    case 'B4':
      return 'L';
    case 'A2':
    case 'A3':
    case 'A4':
    case 'A6':
      return 'M';
    case 'A5':
      return 'H';
    default:
      return '-';
  }
}

/** Ground speed in tens of knots plus wake letter, e.g. "29M". */
export function formatGsWake(gs: number | undefined, category: string | undefined): string {
  if (gs === undefined) return '---';
  const tens = Math.min(99, Math.max(0, Math.round(gs / 10)));
  return String(tens).padStart(2, '0') + wakeLetter(category);
}

/** Two-letter emergency prefix, or null when there is no emergency; readsb's `reserved` codes are none. */
export function emergencyCode(
  squawk: string | undefined,
  emergency: string | undefined,
): 'HJ' | 'RF' | 'EM' | null {
  if (squawk === '7500') return 'HJ';
  if (squawk === '7600') return 'RF';
  if (squawk === '7700') return 'EM';
  if (emergency !== undefined && emergency !== 'none' && emergency !== 'reserved') return 'EM';
  return null;
}

export function formatMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  if (seconds >= 3600) return '>1h';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Three digits, 001 to 360: north is 360, as headings and bearings are spoken. */
export function padBearing(deg: number): string {
  const d = Math.round(deg) % 360;
  return String(d === 0 ? 360 : d).padStart(3, '0');
}

export function padTrack(deg: number | undefined): string {
  return deg === undefined ? '---' : padBearing(deg);
}

export function formatMach(m: number | undefined): string {
  return m === undefined ? '---' : `M${m.toFixed(2)}`;
}

/** Wind as direction over speed in knots; blank unless both are known. */
export function formatWind(dir: number | undefined, speed: number | undefined): string {
  return dir === undefined || speed === undefined
    ? '---'
    : `${padBearing(dir)}° / ${Math.round(speed)}`;
}

/** Celsius with an explicit sign above zero. */
export function formatTemp(c: number | undefined): string {
  if (c === undefined) return '---';
  const r = Math.round(c);
  return `${r > 0 ? '+' : ''}${r}°C`;
}

/** The list's head count, naming what the filter hides only while it hides something. */
export function formatListCount(shown: number, total: number): string {
  const hidden = total - shown;
  return hidden > 0 ? `${shown} · ${hidden} hidden` : String(shown);
}
