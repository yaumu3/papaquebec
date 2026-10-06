import { type DisplayAltitude, displayAltitude, uncorrected } from '../lib/altitude';
import {
  climbArrow,
  formatAge,
  formatMach,
  formatModes,
  padBearing,
  sourceName,
} from '../lib/format';
import { hpaToInHg } from '../lib/metar';
import { magneticTrack } from '../state/magnetic';
import type { ReadingKey } from '../state/plotted';
import { settings } from '../state/settings';
import type { Position, Readout } from '../state/track';

/** A value with its unit kept apart so the unit can be set quieter than the number. */
export interface Reading {
  v: string;
  unit?: string;
  /** A lit marker after the unit, such as the climb arrow. */
  tail?: string;
  /** A second value after a dot, in the plain text tone whatever the cell's own. */
  also?: string;
  /** A unit after the second value. */
  alsoUnit?: string;
}

/** The one reading of anything unknown; a cell dims when it holds this. */
export const NONE: Reading = { v: '---' };

export const plain = (v: string | undefined): Reading => (v === undefined ? NONE : { v });

/** The position as one cell, which owns up to a fix that is no longer live. */
export function positionReading(p: Position): { k: string; r: Reading } {
  if (p.kind === 'none') return { k: 'POSITION', r: NONE };
  return {
    k: p.kind === 'last' ? 'LAST POSITION' : 'POSITION',
    r: { v: `${p.lat.toFixed(5)} ${p.lon.toFixed(5)}` },
  };
}

const num = (v: number | undefined, unit: string, digits = 0): Reading =>
  v === undefined ? NONE : { v: v.toFixed(digits), unit };

const signed = (v: number | undefined, unit: string): Reading =>
  v === undefined ? NONE : { v: `${v > 0 ? '+' : ''}${Math.round(v)}`, unit };

const bearing = (deg: number | undefined): Reading =>
  deg === undefined ? NONE : { v: `${padBearing(deg)}°` };

function levelReading(d: DisplayAltitude, tail = ''): Reading {
  switch (d.kind) {
    case 'altitude':
      return { v: String(d.feet), unit: 'ft', tail };
    case 'level':
      return { v: `FL${String(Math.round(d.feet / 100)).padStart(3, '0')}`, tail };
    case 'ground':
      return { v: 'GND' };
    default:
      return NONE;
  }
}

const altitudeReading = (r: Readout): Reading =>
  levelReading(displayAltitude(r.alt, settings.altimeter), climbArrow(r.verticalRate).trim());

const selectedReading = (ft: number | undefined): Reading =>
  levelReading(displayAltitude(ft, uncorrected(settings.altimeter)));

/** Magnetic track the scope derives, then the transmitted true one. */
function trackReading(r: Readout): Reading {
  const mag = magneticTrack(r);
  if (r.track === undefined || mag === undefined) return NONE;
  return { v: `${padBearing(mag)}°`, also: `${padBearing(r.track)}°`, alsoUnit: 'T' };
}

/** Where the wind blows from, then how fast; blank unless both are known. */
function windReading(r: Readout): Reading {
  if (r.windDir === undefined || r.windSpeed === undefined) return NONE;
  return { v: `${padBearing(r.windDir)}°`, also: String(Math.round(r.windSpeed)), alsoUnit: 'kt' };
}

const inHg = (hpa: number | undefined) => (hpa === undefined ? undefined : hpaToInHg(hpa));

/** How long ago the target was last heard, and how long ago with a position. */
const ageReading = (r: Readout): Reading => ({
  v: `${formatAge(r.seen)} / ${formatAge(r.seenPos)}`,
  unit: 's',
});

export interface ReadingSpec {
  label: string;
  format: (r: Readout) => Reading;
}

/** Every reading the detail table shows of a target, as it is labeled and printed. */
export const READINGS: Record<ReadingKey, ReadingSpec> = {
  alt: { label: 'ALT', format: altitudeReading },
  selAlt: { label: 'SEL ALT', format: (r) => selectedReading(r.selAlt) },
  fmsAlt: { label: 'FMS ALT', format: (r) => selectedReading(r.fmsAlt) },
  vs: { label: 'VS', format: (r) => signed(r.verticalRate, 'fpm') },
  trk: { label: 'TRK', format: trackReading },
  selHdg: { label: 'SEL HDG', format: (r) => bearing(r.selHeading) },
  gs: { label: 'GS', format: (r) => num(r.gs, 'kt') },
  qnh: { label: 'QNH', format: (r) => num(inHg(r.navQnh), 'inHg', 2) },
  modes: { label: 'MODES', format: (r) => plain(formatModes(r.navModes)) },
  ias: { label: 'IAS', format: (r) => num(r.ias, 'kt') },
  tas: { label: 'TAS', format: (r) => num(r.tas, 'kt') },
  mach: { label: 'MACH', format: (r) => (r.mach === undefined ? NONE : { v: formatMach(r.mach) }) },
  wind: { label: 'WIND', format: windReading },
  oat: { label: 'OAT', format: (r) => signed(r.oat, '°C') },
  tat: { label: 'TAT', format: (r) => signed(r.tat, '°C') },
  nic: { label: 'NIC', format: (r) => num(r.nic, '') },
  nacp: { label: 'NACP', format: (r) => num(r.nacP, '') },
  src: { label: 'SRC', format: (r) => ({ v: sourceName(r.source) }) },
  rssi: { label: 'RSSI', format: (r) => num(r.rssi, 'dB', 1) },
  msgs: { label: 'MSGS', format: (r) => num(r.messageRate, '/s', 1) },
  age: { label: 'SEEN / POS', format: ageReading },
};
