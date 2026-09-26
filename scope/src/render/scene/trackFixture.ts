import type { Track } from '../../state/track';

/** A live, level ANA241 over RJFF with every optional readout unknown; tests override what they exercise. */
export function makeTrack(over: Partial<Track> = {}): Track {
  return {
    hex: '867a01',
    flight: 'ANA241',
    squawk: '2431',
    category: 'A3',
    alt: 11000,
    gs: 290,
    track: 235,
    baroRate: 0,
    nic: 8,
    nacP: 9,
    messages: 1,
    rssi: -10,
    type: 'B789',
    registration: 'JA893A',
    description: 'Boeing 787-9',
    emergency: undefined,
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
    seen: 0.2,
    seenPos: 0.2,
    position: { kind: 'live', lat: 33.6, lon: 130.5, x: 1, y: 2 }, // RJFF
    history: [],
    ops: { hideTrail: false, pinnedCorner: null, autoCorner: 'ne' },
    ...over,
  };
}
