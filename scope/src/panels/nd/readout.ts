import type { Heard, HeardKey } from '../../lib/aircraft';
import { steeringHeading } from '../../lib/autopilot';
import { padBearing } from '../../lib/format';
import { holds, INSTRUMENT_SEC } from '../../lib/reports';
import { magneticBearing, magneticTrack } from '../../state/magnetic';
import type { Readout } from '../../state/track';
import { NONE, type Reading, READINGS } from '../readings';

/** The state of the instrument: oriented on the heading, on the track, or blank for want of both. */
export type NdMode = 'heading' | 'track' | 'lost' | 'blank';

export type NdFlag = 'TRK' | 'HDG';

export interface NdFrame {
  mode: NdMode;
  /** The bearing at the top of the display, magnetic. */
  orient: number;
  label: NdFlag;
  box: string;
  flags: readonly NdFlag[];
  lastHeard: string | undefined;
}

const BLANK_BOX = '---';

/**
 * When the oldest of the keys heard was heard. A key never heard does not age the value: a reading
 * is absent exactly when it was not reported, and many aircraft send a selection with no modes.
 */
export function oldestHeard(heard: Heard, keys: readonly HeardKey[]): number | undefined {
  const times = keys.flatMap((key) => heard[key] ?? []);
  return times.length === 0 ? undefined : Math.min(...times);
}

/** Whether a value read from these keys still holds: it is as old as the oldest of them. */
const holdsAll = (t: Pick<Readout, 'heard'>, keys: readonly HeardKey[], now: number): boolean =>
  holds(oldestHeard(t.heard, keys), now, INSTRUMENT_SEC);

/** Whether the target's last message is `INSTRUMENT_SEC` old or older: the instrument has lost it. */
const isLost = (t: Pick<Readout, 'seen'>): boolean => t.seen >= INSTRUMENT_SEC;

/** The mode the instrument is in: the heading while it holds, else the magnetic track while it holds. */
function modeOf(t: Readout, now: number): NdMode {
  if (isLost(t)) return 'lost';
  if (holds(t.heard.heading, now, INSTRUMENT_SEC) && t.heading !== undefined) return 'heading';
  if (holds(t.heard.track, now, INSTRUMENT_SEC) && magneticTrack(t) !== undefined) return 'track';
  return 'blank';
}

/** The bearing the display is oriented on: the last heading, else the last track, whatever their age. */
function orientOf(t: Readout, mode: NdMode): number {
  if (mode === 'track') return magneticTrack(t) ?? 0;
  return t.heading ?? magneticTrack(t) ?? 0;
}

const FLAGS: Record<NdMode, readonly NdFlag[]> = {
  heading: [],
  track: ['HDG'],
  lost: ['TRK', 'HDG'],
  blank: ['TRK', 'HDG'],
};

/** What the top of the ND reads, and the flags beside it, from the freshness of the target's readings. */
export function ndFrame(t: Readout, now: number): NdFrame {
  const mode = modeOf(t, now);
  const orient = orientOf(t, mode);
  const live = mode === 'heading' || mode === 'track';
  return {
    mode,
    orient,
    label: mode !== 'track' && t.heading !== undefined ? 'HDG' : 'TRK',
    box: live ? padBearing(orient) : BLANK_BOX,
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
  trk: NdText;
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
  const wind = () =>
    t.windDir === undefined || t.windSpeed === undefined
      ? undefined
      : `${padBearing(magneticBearing(t.windDir, t.at))}°/${Math.round(t.windSpeed)}`;
  return {
    gs: read(['gs'], () => shown(READINGS.gs.format(t))),
    tas: read(['tas'], () => shown(READINGS.tas.format(t))),
    wind: read(['windDir', 'windSpeed'], wind),
    sel: read(['selHeading', 'navModes'], () => degrees(steeringHeading(t)), true),
    trk: read(['track'], () => degrees(magneticTrack(t)), true),
    tat: read(['tat'], () => shown(READINGS.tat.format(t), true)),
    sat: read(['oat'], () => shown(READINGS.oat.format(t), true)),
  };
}

/** What the ND draws of the target's own state, in degrees magnetic, each while it holds. */
export interface NdSymbols {
  track?: number | undefined;
  sel?: number | undefined;
}

/** The symbols of a live frame; none in a blank or a lost one, where the compass stands on a last orientation. */
export function ndSymbols(t: Readout, now: number): NdSymbols {
  const mode = modeOf(t, now);
  if (mode !== 'heading' && mode !== 'track') return {};
  const live = (keys: readonly HeardKey[], v: number | undefined) =>
    holdsAll(t, keys, now) ? v : undefined;
  return {
    track: live(['track'], magneticTrack(t)),
    sel: live(['selHeading', 'navModes'], steeringHeading(t)),
  };
}
