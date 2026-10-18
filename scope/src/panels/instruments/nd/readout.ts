import type { HeardKey } from '../../../lib/aircraft';
import { type Altimeter, crewAltitudeFt } from '../../../lib/altitude';
import { steeringHeading } from '../../../lib/autopilot';
import { padBearing } from '../../../lib/format';
import { holds, INSTRUMENT_SEC } from '../../../lib/reports';
import { magneticBearing, magneticTrack } from '../../../state/magnetic';
import type { Readout } from '../../../state/track';
import { NONE, type Reading, READINGS } from '../../readings';
import { holdsAll, isLost } from '../freshness';
import type { Trend } from './geometry';

/** The state of the instrument: track-up, lost, or blank for want of a track that holds. */
export type NdMode = 'track' | 'lost' | 'blank';

export type NdFlag = 'TRK';

export interface NdFrame {
  mode: NdMode;
  /** The bearing at the top of the display, magnetic. */
  orient: number;
  box: string;
  flags: readonly NdFlag[];
  lastHeard: string | undefined;
}

const BLANK_BOX = '---';

/** The mode the instrument is in: track-up while the magnetic track holds. */
function modeOf(t: Readout, now: number): NdMode {
  if (isLost(t)) return 'lost';
  if (holds(t.heard.track, now, INSTRUMENT_SEC) && magneticTrack(t) !== undefined) return 'track';
  return 'blank';
}

/** The bearing the display is oriented on: the track, else the last heading, whatever their age. */
const orientOf = (t: Readout): number => magneticTrack(t) ?? t.heading ?? 0;

const FLAGS: Record<NdMode, readonly NdFlag[]> = {
  track: [],
  lost: ['TRK'],
  blank: ['TRK'],
};

/** What the box at the top reads: the bearing at the top of a live display, else the blank. */
export const boxOf = (mode: NdMode, orient: number): string =>
  mode === 'track' ? padBearing(orient) : BLANK_BOX;

/** What the top of the ND reads, and the flags beside it, from the freshness of the target's readings. */
export function ndFrame(t: Readout, now: number): NdFrame {
  const mode = modeOf(t, now);
  const orient = orientOf(t);
  return {
    mode,
    orient,
    box: boxOf(mode, orient),
    flags: FLAGS[mode],
    lastHeard: mode === 'lost' ? `LAST HEARD ${Math.round(t.seen)} s` : undefined,
  };
}

/** What a corner of the ND prints, and whether it is a value or the blank of an unknown. */
export interface NdText {
  text: string;
  known: boolean;
}

export interface NdReadouts {
  gs: NdText;
  tas: NdText;
  wind: NdText;
  sel: NdText;
  hdg: NdText;
  tat: NdText;
  sat: NdText;
}

const degrees = (deg: number | undefined): string | undefined =>
  deg === undefined ? undefined : `${padBearing(deg)}°`;

/** A reading's value, with its unit when `withUnit`; undefined for the reading of the unknown. */
const shown = (r: Reading, withUnit = false): string | undefined =>
  r === NONE ? undefined : `${r.v}${withUnit ? (r.unit ?? '') : ''}`;

/** The corners of the ND: each value on its own freshness, all blank once the target is lost. */
export function ndReadouts(t: Readout, now: number): NdReadouts {
  const lost = isLost(t);
  const read = (keys: readonly HeardKey[], text: () => string | undefined, degree = false) => {
    const fresh = !lost && holdsAll(t, keys, now);
    const value = fresh ? text() : undefined;
    if (value !== undefined) return { text: value, known: true };
    return { text: degree ? '---°' : '---', known: false };
  };
  const wind = () => {
    const from = windFromOf(t);
    return from === undefined || t.windSpeed === undefined
      ? undefined
      : `${padBearing(from)}°/${Math.round(t.windSpeed)}`;
  };
  return {
    gs: read(['gs'], () => shown(READINGS.gs.format(t))),
    tas: read(['tas'], () => shown(READINGS.tas.format(t))),
    wind: read(['windDir', 'windSpeed'], wind),
    sel: read(['selHeading', 'navModes'], () => degrees(steeringHeading(t)), true),
    hdg: read(['heading'], () => degrees(t.heading), true),
    tat: read(['tat'], () => shown(READINGS.tat.format(t), true)),
    sat: read(['oat'], () => shown(READINGS.oat.format(t), true)),
  };
}

/** What the ND draws of the target's own state, in degrees magnetic, each while it holds. */
export interface NdSymbols {
  track?: number | undefined;
  /** The heading, magnetic as reported. */
  heading?: number | undefined;
  sel?: number | undefined;
  trend?: Trend | undefined;
  /** The distance, in nautical miles, at which the aircraft levels off at its selected altitude. */
  levelOffNm?: number | undefined;
  /** Where the wind blows from, degrees magnetic. */
  windFrom?: number | undefined;
}

/** A turn slower than this, in degrees per second, is flight in a straight line: no trend is drawn. */
const TREND_MIN_RATE_DEG_S = 0.3;

/** The symbols of a live frame; none in a blank or a lost one, where the compass stands on a last orientation. */
export function ndSymbols(t: Readout, now: number, altimeter: Altimeter): NdSymbols {
  if (modeOf(t, now) !== 'track') return {};
  const live = (keys: readonly HeardKey[], v: number | undefined) =>
    holdsAll(t, keys, now) ? v : undefined;
  return {
    track: live(['track'], magneticTrack(t)),
    heading: live(['heading'], t.heading),
    sel: live(['selHeading', 'navModes'], steeringHeading(t)),
    trend: trendOf(t, now),
    levelOffNm: levelOffOf(t, now, altimeter),
    windFrom: live(['windDir', 'windSpeed'], windFromOf(t)),
  };
}

/** The turn rate and ground speed, while both hold, the aircraft is under way and the track turns. */
function trendOf(t: Readout, now: number): Trend | undefined {
  const { trackRate: rateDegS, gs: gsKt } = t;
  if (rateDegS === undefined || gsKt === undefined) return undefined;
  if (!holdsAll(t, ['trackRate', 'gs'], now)) return undefined;
  if (Math.abs(rateDegS) < TREND_MIN_RATE_DEG_S || gsKt <= 0) return undefined;
  return { rateDegS, gsKt };
}

/**
 * How far ahead the aircraft levels off, while it climbs or descends toward its selected altitude
 * as the crew reads it, the reference `holdsSelected` compares on: the altitude still to go at the
 * rate of climb, flown at the ground speed.
 */
function levelOffOf(t: Readout, now: number, altimeter: Altimeter): number | undefined {
  const { selAlt, verticalRate: vs, gs } = t;
  if (selAlt === undefined || vs === undefined || gs === undefined) return undefined;
  if (!holdsAll(t, ['alt', 'selAlt', 'verticalRate', 'gs'], now)) return undefined;
  const crew = crewAltitudeFt(t, altimeter);
  if (crew === undefined || vs === 0 || Math.sign(selAlt - crew) !== Math.sign(vs))
    return undefined;
  return (gs * Math.abs(selAlt - crew)) / Math.abs(vs) / 60;
}

/** The direction the wind blows from, magnetic, when both its direction and its speed are known. */
const windFromOf = (t: Readout): number | undefined =>
  t.windDir === undefined || t.windSpeed === undefined
    ? undefined
    : magneticBearing(t.windDir, t.at);
