import type { Heard } from '../lib/aircraft';
import { LAPSE_SEC } from '../lib/reports';
import type { Sample } from './track';
import type { Interval } from './window';

/** The ages a lapse's edge is tested at: just under it, exactly at it and just over it. */
export const AROUND_LAPSE = [LAPSE_SEC - 0.1, LAPSE_SEC, LAPSE_SEC + 0.1];

/** A window holding every test sample. */
export const ALL: Interval = { from: 0, to: 10_000 };

/** A sample at `t` with no reading but those given. */
export function makeSample(t: number, over: Partial<Sample> = {}): Sample {
  return {
    t,
    messageRate: undefined,
    messages: undefined,
    alt: undefined,
    gs: undefined,
    track: undefined,
    heading: undefined,
    verticalRate: undefined,
    roll: undefined,
    trackRate: undefined,
    nic: undefined,
    rc: undefined,
    nacP: undefined,
    rssi: undefined,
    tas: undefined,
    ias: undefined,
    mach: undefined,
    windSpeed: undefined,
    windDir: undefined,
    oat: undefined,
    tat: undefined,
    selAlt: undefined,
    fmsAlt: undefined,
    selHeading: undefined,
    navQnh: undefined,
    navModes: undefined,
    source: 'adsb',
    seen: 0,
    seenPos: undefined,
    heard: {},
    at: undefined,
    ...over,
  };
}

/** A sample at `t` with no reading but those given, each heard at `t`. */
export function makeHeardSample(t: number, over: Partial<Sample> = {}): Sample {
  const heard: Heard = Object.fromEntries(Object.keys(over).map((key) => [key, t]));
  return makeSample(t, { ...over, heard });
}
