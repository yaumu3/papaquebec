import type { PositionSource } from './aircraft';
import { NM_IN_METERS } from './geo';

export type ClimbState = 'climbing' | 'descending' | 'level';

/** Five steps of the ADS-B vertical rate, whose LSB is 64 fpm (RTCA DO-260B). */
const CLIMB_DEAD_BAND_FPM = 5 * 64;

export function climbState(verticalRate: number | undefined): ClimbState {
  if (verticalRate === undefined) return 'level';
  if (verticalRate > CLIMB_DEAD_BAND_FPM) return 'climbing';
  if (verticalRate < -CLIMB_DEAD_BAND_FPM) return 'descending';
  return 'level';
}

export function climbArrow(verticalRate: number | undefined): string {
  switch (climbState(verticalRate)) {
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

/** The shorthand of an emergency: hijack, radio failure, or any other. */
export type EmergencyCode = 'HJ' | 'RF' | 'EM';

/** The shorthand of each emergency code of the Mode A. */
const SQUAWK_CODES: Readonly<Record<string, EmergencyCode>> = {
  '7500': 'HJ',
  '7600': 'RF',
  '7700': 'EM',
};

/**
 * The shorthand of each emergency/priority status that is an emergency: general, no
 * communications and unlawful interference are the statuses a transponder sets with 7700, 7600
 * and 7500, and a downed aircraft is in distress. Lifeguard and minimum fuel are a priority, not
 * an emergency; `none` and `reserved` say nothing.
 */
const STATUS_CODES: Readonly<Record<string, EmergencyCode>> = {
  general: 'EM',
  nordo: 'RF',
  unlawful: 'HJ',
  downed: 'EM',
};

const squawkCode = (squawk: string | undefined): EmergencyCode | null =>
  (squawk && SQUAWK_CODES[squawk]) || null;

const statusCode = (emergency: string | undefined): EmergencyCode | null =>
  (emergency && STATUS_CODES[emergency]) || null;

/**
 * The shorthand of the emergency a squawk or an emergency/priority status declares, the code's
 * before the status's; null when neither declares one.
 */
export function emergencyCode(
  squawk: string | undefined,
  emergency: string | undefined,
): EmergencyCode | null {
  return squawkCode(squawk) ?? statusCode(emergency);
}

/** A priority an emergency/priority status asks for that is not an emergency. */
export type Priority = 'lifeguard' | 'minfuel';

/** What a squawk and an emergency/priority status tell, each told once. */
export interface StatusTags {
  /** The shorthand of the emergency code the squawk is. */
  code: EmergencyCode | null;
  /** The emergency the status declares, unless the code already says it. */
  status: EmergencyCode | 'DOWNED' | null;
  priority: Priority | null;
}

export function statusTags(squawk: string | undefined, emergency: string | undefined): StatusTags {
  const code = squawkCode(squawk);
  const declared = emergency === 'downed' ? 'DOWNED' : statusCode(emergency);
  const priority = emergency === 'lifeguard' || emergency === 'minfuel' ? emergency : null;
  return { code, status: declared === code ? null : declared, priority };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Hours, minutes and seconds of the UTC clock, from seconds since the epoch. */
export function clockTime(seconds: number): string {
  const d = new Date(seconds * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** A position source as the panels name it. */
export const sourceName = (source: PositionSource): string => source.toUpperCase();

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

const MODE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  autopilot: 'AP',
  althold: 'ALT',
  approach: 'APP',
};

/** The names of the engaged modes, abbreviated as a panel shows them. */
export function modeNames(modes: readonly string[]): string[] {
  return modes.map((m) => MODE_ABBREVIATIONS[m] ?? m.toUpperCase());
}

/** The mode names in one line; undefined when none are engaged. */
export function formatModes(modes: string[] | undefined): string | undefined {
  return modes?.length ? modeNames(modes).join(' ') : undefined;
}

export function formatMach(m: number | undefined): string {
  return m === undefined ? '---' : `M${m.toFixed(2)}`;
}

/**
 * A quantity in tenths while those read below `wholeFrom`, whole from there on, either rounded by
 * `round`: to the nearest unless told otherwise.
 */
function formatTenthsBelow(
  value: number | undefined,
  wholeFrom: number,
  round: (n: number) => number = Math.round,
): string {
  if (value === undefined) return '---';
  const tenths = round(value * 10) / 10;
  return tenths < wholeFrom ? tenths.toFixed(1) : String(round(value));
}

/** Seconds since something was last heard: in tenths up to ten seconds. */
export const formatAge = (seconds: number | undefined): string => formatTenthsBelow(seconds, 10);

/** A distance in nautical miles: in tenths up to a hundred miles. */
export const formatDistance = (nm: number | undefined): string => formatTenthsBelow(nm, 100);

/** Where a bound in metres starts to read in nautical miles: a tenth of a mile. */
const BOUND_NM_FROM_M = NM_IN_METERS / 10;

/**
 * How far a bound may run past a step of the miles and still read as that step: the tracker
 * sends each radius rounded up to whole metres, 0.1 NM (185.2 m) as 186.
 */
const BOUND_ROUNDED_UP_BY_M = 1;

/**
 * An upper bound in metres, such as a radius of containment, rounded up: in whole metres below a
 * tenth of a mile, and in nautical miles from there, in tenths below one mile.
 */
export function formatBoundM(m: number): { v: string; unit: string } {
  if (m < BOUND_NM_FROM_M) return { v: `<${Math.ceil(m)}`, unit: 'm' };
  const nm = (m - BOUND_ROUNDED_UP_BY_M) / NM_IN_METERS;
  return { v: `<${formatTenthsBelow(nm, 1, Math.ceil)}`, unit: 'NM' };
}
