import type { HeardKey } from '../../../lib/aircraft';
import { type Altimeter, crewAltitudeFt } from '../../../lib/altitude';
import { steeringHeading } from '../../../lib/autopilot';
import { degreesText, padBearing } from '../../../lib/format';
import { magneticBearing, magneticTrack } from '../../../state/magnetic';
import type { Readout } from '../../../state/track';
import { HEARD, NONE, type Reading, READINGS, windOf } from '../../readings';
import { holdsAll, ifHolds, isLost } from '../freshness';
import type { Moment } from '../moment';
import type { Trend } from './geometry';

/** The state of the instrument: track-up, lost, blank for want of a track that holds, or empty over a gap. */
type NdMode = 'track' | 'lost' | 'blank' | 'empty';

type NdFlag = 'TRK';

export interface NdFrame {
  mode: NdMode;
  /** The bearing at the top of the display, magnetic. */
  orient: number;
  flags: readonly NdFlag[];
  lastHeard: string | undefined;
}

const BLANK_BOX = '---';

/** The mode the instrument is in: track-up while the magnetic track holds. */
function modeOf(m: Moment<Readout>): NdMode {
  if (m.kind === 'empty') return 'empty';
  const { r: t, instant } = m;
  if (isLost(t)) return 'lost';
  if (holdsAll(t, ['track'], instant) && magneticTrack(t) !== undefined) return 'track';
  return 'blank';
}

/** The bearing the display is oriented on: the track, else the last heading, whatever their age. */
const orientOf = (t: Readout): number => magneticTrack(t) ?? t.heading ?? 0;

const FLAGS: Record<NdMode, readonly NdFlag[]> = {
  track: [],
  lost: ['TRK'],
  blank: ['TRK'],
  empty: [],
};

/** What the box at the top reads: the bearing at the top of a live display, else the blank. */
export const boxOf = (mode: NdMode, orient: number): string =>
  mode === 'track' ? padBearing(orient) : BLANK_BOX;

/**
 * What the top of the ND reads, and the flags beside it, from the freshness of the target's
 * readings; over a gap, the compass stays on the orientation `standing` and nothing is flagged.
 */
export function ndFrame(m: Moment<Readout>, standing = 0): NdFrame {
  const mode = modeOf(m);
  const orient = m.kind === 'empty' ? standing : orientOf(m.r);
  return {
    mode,
    orient,
    flags: FLAGS[mode],
    lastHeard:
      mode === 'lost' && m.kind !== 'empty' ? `LAST HEARD ${Math.round(m.r.seen)} s` : undefined,
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
  deg === undefined ? undefined : degreesText(deg);

/** A reading's value, with its unit when `withUnit`; undefined for the reading of the unknown. */
const shown = (r: Reading, withUnit = false): string | undefined =>
  r === NONE ? undefined : `${r.v}${withUnit ? (r.unit ?? '') : ''}`;

const blank = (degree = false): NdText => ({ text: degree ? '---°' : '---', known: false });

const BLANK_READOUTS: NdReadouts = {
  gs: blank(),
  tas: blank(),
  wind: blank(),
  sel: blank(true),
  hdg: blank(true),
  tat: blank(),
  sat: blank(),
};

/**
 * The corners of the ND: each value on its own freshness, all blank once the target is lost and
 * over a gap.
 */
export function ndReadouts(m: Moment<Readout>): NdReadouts {
  if (m.kind === 'empty' || isLost(m.r)) return BLANK_READOUTS;
  const { r: t, instant } = m;
  const read = (keys: readonly HeardKey[], text: string | undefined, degree = false) => {
    const value = ifHolds(t, keys, instant, text);
    return value === undefined ? blank(degree) : { text: value, known: true };
  };
  const wind = () => {
    const w = windOf(t);
    return w && `${degreesText(magneticBearing(w.dir, t.at))}/${Math.round(w.speed)}`;
  };
  return {
    gs: read(HEARD.gs, shown(READINGS.gs.format(t))),
    tas: read(HEARD.tas, shown(READINGS.tas.format(t))),
    wind: read(HEARD.wind, wind()),
    sel: read(HEARD.selHdg, degrees(steeringHeading(t)), true),
    hdg: read(['heading'], degrees(t.heading), true),
    tat: read(HEARD.tat, shown(READINGS.tat.format(t), true)),
    sat: read(HEARD.oat, shown(READINGS.oat.format(t), true)),
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

/**
 * The symbols of a live frame; none in a blank, lost or empty one, where the compass stands on a
 * last orientation.
 */
export function ndSymbols(m: Moment<Readout>, altimeter: Altimeter): NdSymbols {
  if (m.kind === 'empty' || modeOf(m) !== 'track') return {};
  const { r: t, instant } = m;
  return {
    track: ifHolds(t, ['track'], instant, magneticTrack(t)),
    heading: ifHolds(t, ['heading'], instant, t.heading),
    sel: ifHolds(t, HEARD.selHdg, instant, steeringHeading(t)),
    trend: trendOf(t, instant),
    levelOffNm: levelOffOf(t, instant, altimeter),
    windFrom: ifHolds(t, HEARD.wind, instant, windFromOf(t)),
  };
}

/** The turn rate and ground speed, while both hold, the aircraft is under way and the track turns. */
function trendOf(t: Readout, instant: number): Trend | undefined {
  const { trackRate: rateDegS, gs: gsKt } = t;
  if (rateDegS === undefined || gsKt === undefined) return undefined;
  if (!holdsAll(t, ['trackRate', 'gs'], instant)) return undefined;
  if (Math.abs(rateDegS) < TREND_MIN_RATE_DEG_S || gsKt <= 0) return undefined;
  return { rateDegS, gsKt };
}

/**
 * How far ahead the aircraft levels off, while it climbs or descends toward its selected altitude
 * as the crew reads it, the reference `holdsSelected` compares on: the altitude still to go at the
 * rate of climb, flown at the ground speed.
 */
function levelOffOf(t: Readout, instant: number, altimeter: Altimeter): number | undefined {
  const { selAlt, verticalRate: vs, gs } = t;
  if (selAlt === undefined || vs === undefined || gs === undefined) return undefined;
  if (!holdsAll(t, ['alt', 'selAlt', 'verticalRate', 'gs'], instant)) return undefined;
  const crew = crewAltitudeFt(t, altimeter);
  if (crew === undefined || vs === 0 || Math.sign(selAlt - crew) !== Math.sign(vs))
    return undefined;
  return (gs * Math.abs(selAlt - crew)) / Math.abs(vs) / 60;
}

/** The direction the wind blows from, magnetic, when both its direction and its speed are known. */
const windFromOf = (t: Readout): number | undefined => {
  const w = windOf(t);
  return w && magneticBearing(w.dir, t.at);
};
