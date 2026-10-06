import type { Sample } from './track';

/** A sample at `t` with no reading but those given. */
export function makeSample(t: number, over: Partial<Sample> = {}): Sample {
  return {
    t,
    messageRate: undefined,
    messages: undefined,
    alt: undefined,
    gs: undefined,
    track: undefined,
    verticalRate: undefined,
    nic: undefined,
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
    ...over,
  };
}
