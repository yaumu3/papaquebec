import { epuM } from '../lib/accuracy';
import { type DisplayAltitude, displayAltitude, uncorrected } from '../lib/altitude';
import { steeringHeading } from '../lib/autopilot';
import {
  climbArrow,
  formatAge,
  formatBoundM,
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

/** The position as one cell. */
export function positionReading(p: Position): { k: string; r: Reading } {
  if (p.kind === 'none') return { k: 'POSITION', r: NONE };
  return { k: 'POSITION', r: { v: `${p.lat.toFixed(5)} ${p.lon.toFixed(5)}` } };
}

const num = (v: number | undefined, unit: string, digits = 0): Reading =>
  v === undefined ? NONE : { v: v.toFixed(digits), unit };

const signed = (v: number | undefined, unit: string): Reading =>
  v === undefined ? NONE : { v: `${v > 0 ? '+' : ''}${Math.round(v)}`, unit };

/** A bearing with its degree mark, or the blank of the unknown. */
const degrees = (deg: number | undefined): string =>
  deg === undefined ? '---' : `${padBearing(deg)}°`;

const bearing = (deg: number | undefined): Reading =>
  deg === undefined ? NONE : { v: degrees(deg) };

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

/** Magnetic track the scope derives, then the magnetic heading as sent; blank unless one is known. */
function trackReading(r: Readout): Reading {
  const mag = magneticTrack(r);
  if (mag === undefined && r.heading === undefined) return NONE;
  return { v: `${degrees(mag)} / ${degrees(r.heading)}` };
}

/** Where the wind blows from, then how fast; blank unless both are known. */
function windReading(r: Readout): Reading {
  if (r.windDir === undefined || r.windSpeed === undefined) return NONE;
  return { v: `${degrees(r.windDir)} / ${Math.round(r.windSpeed)}`, unit: 'kt' };
}

const inHg = (hpa: number | undefined) => (hpa === undefined ? undefined : hpaToInHg(hpa));

/** How long ago the target was last heard, and how long ago with a position. */
const ageReading = (r: Readout): Reading => ({
  v: `${formatAge(r.seen)} / ${formatAge(r.seenPos)}`,
  unit: 's',
});

/** An upper bound in metres; a query when the category bounds nothing. */
function boundReading(m: number | undefined): Reading {
  return m === undefined ? { v: '?' } : formatBoundM(m);
}

/**
 * The radius of containment the position's NIC stands for, or the category itself where the
 * standard assigns its combination no radius; blank without a position, and for NIC 0, which is
 * no category: the integrity of an MLAT or TIS-B fix, or one not known.
 */
function nicReading(r: Readout): Reading {
  if (!r.nic) return NONE;
  return r.rc === undefined ? { v: String(r.nic) } : boundReading(r.rc);
}

/** The position error bound the NACp stands for; blank without a NACp. */
const nacpReading = (r: Readout): Reading =>
  r.nacP === undefined ? NONE : boundReading(epuM(r.nacP));

const fpm = (v: number | undefined) => signed(v, 'fpm');
const kt = (v: number | undefined) => num(v, 'kt');
const celsius = (v: number | undefined) => signed(v, '°C');
const dB = (v: number | undefined) => num(v, 'dB', 1);
const perSecond = (v: number | undefined) => num(v, '/s', 1);
const inHgReading = (v: number | undefined) => num(v, 'inHg', 2);
const machReading = (v: number | undefined): Reading =>
  v === undefined ? NONE : { v: formatMach(v) };

export interface ReadingSpec {
  label: string;
  format: (r: Readout) => Reading;
  /** A number the reading may hold, in its own unit, as it reads; for a reading plotted on a scale. */
  value?: (v: number) => Reading;
}

/** Every reading the detail table shows of a target, as it is labeled and printed. */
export const READINGS: Record<ReadingKey, ReadingSpec> = {
  alt: { label: 'ALT', format: altitudeReading, value: selectedReading },
  selAlt: { label: 'SEL ALT', format: (r) => selectedReading(r.selAlt) },
  fmsAlt: { label: 'FMS ALT', format: (r) => selectedReading(r.fmsAlt) },
  vs: { label: 'VS', format: (r) => fpm(r.verticalRate), value: fpm },
  trk: { label: 'TRK / HDG', format: trackReading },
  selHdg: { label: 'SEL HDG', format: (r) => bearing(steeringHeading(r)) },
  gs: { label: 'GS', format: (r) => kt(r.gs), value: kt },
  qnh: { label: 'QNH', format: (r) => inHgReading(inHg(r.navQnh)), value: inHgReading },
  modes: { label: 'MODES', format: (r) => plain(formatModes(r.navModes)) },
  ias: { label: 'IAS', format: (r) => kt(r.ias), value: kt },
  tas: { label: 'TAS', format: (r) => kt(r.tas), value: kt },
  mach: { label: 'MACH', format: (r) => machReading(r.mach), value: machReading },
  wind: { label: 'WIND', format: windReading },
  oat: { label: 'OAT', format: (r) => celsius(r.oat), value: celsius },
  tat: { label: 'TAT', format: (r) => celsius(r.tat), value: celsius },
  nic: { label: 'NIC', format: nicReading, value: boundReading },
  nacp: { label: 'NACP', format: nacpReading, value: boundReading },
  src: { label: 'SRC', format: (r) => ({ v: sourceName(r.source) }) },
  rssi: { label: 'RSSI', format: (r) => dB(r.rssi), value: dB },
  msgs: { label: 'MSGS', format: (r) => perSecond(r.messageRate), value: perSecond },
  age: { label: 'SEEN / POS', format: ageReading, value: (v) => ({ v: formatAge(v), unit: 's' }) },
};
