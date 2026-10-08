import type { ResolutionAdvisory } from '../lib/acas';
import type { AircraftReport, AircraftSnapshot, ReceiverPosition } from '../lib/aircraft';
import {
  AddressType,
  type Aircraft,
  AirGroundState,
  type Frame,
  type Snapshot,
  Source,
  type TargetState_Modes,
} from './gen/papaquebec/feed/v1/feed_pb';

/** The names the scope knows the emergency/priority status codes 0 to 7 by. */
const EMERGENCIES = [
  'none',
  'general',
  'lifeguard',
  'minfuel',
  'nordo',
  'unlawful',
  'downed',
  'reserved',
];

/** The names the scope knows the modes by, in the order it lists them. */
const MODES: [keyof TargetState_Modes, string][] = [
  ['autopilot', 'autopilot'],
  ['vnav', 'vnav'],
  ['altitudeHold', 'althold'],
  ['approach', 'approach'],
  ['lnav', 'lnav'],
  ['tcas', 'tcas'],
];

function hex(a: Aircraft): string {
  const digits = (a.address?.value ?? 0).toString(16).padStart(6, '0');
  return a.address?.type === AddressType.NON_ICAO ? `~${digits}` : digits;
}

/** `A0` to `D7` from the feed's `set * 8 + code`. */
function category(code: number): string {
  return `${'ABCD'[code >> 3] ?? '?'}${code & 7}`;
}

/** Where the aircraft reports being, when it reports both coordinates. */
function position(a: Aircraft): AircraftReport['position'] {
  return a.latDeg === undefined || a.lonDeg === undefined
    ? undefined
    : { lat: a.latDeg, lon: a.lonDeg };
}

function source(a: Aircraft): AircraftReport['source'] {
  if (a.positionSource === Source.MLAT) return 'mlat';
  if (a.positionSource === Source.TISB) return 'tisb';
  return undefined;
}

/** A message as plain data, without the type name protobuf-es stamps on it. */
function plain<T extends { $typeName: string }>(message: T): Omit<T, '$typeName'> {
  const fields = Object.entries(message).filter(([key]) => key !== '$typeName');
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dropping the type name keeps the fields
  return Object.fromEntries(fields) as Omit<T, '$typeName'>;
}

/** The advisory as the scope reads it, its nested messages plain too. */
function advisoryOf(ra: Aircraft['resolutionAdvisory']): ResolutionAdvisory | undefined {
  if (ra === undefined) return undefined;
  const { advisory, corrections, ...rest } = plain(ra);
  return {
    ...rest,
    ...(advisory && { advisory: plain(advisory) }),
    ...(corrections && { corrections: plain(corrections) }),
  };
}

/** Every key of `T`, each known or not: what is built before the unknown ones are dropped. */
type Loose<T> = { [K in keyof T]-?: T[K] | undefined };

function toReport(a: Aircraft): AircraftReport {
  const target = a.targetState;
  const modes = target?.modes;
  const last = a.lastPosition;
  const report: Loose<AircraftReport> = {
    hex: hex(a),
    flight: a.identification,
    squawk: a.modeACode?.toString(8).padStart(4, '0'),
    category: a.emitterCategory === undefined ? undefined : category(a.emitterCategory),
    emergency:
      a.emergencyPriorityStatus === undefined ? undefined : EMERGENCIES[a.emergencyPriorityStatus],
    ident: a.ident ? true : undefined,
    ra: advisoryOf(a.resolutionAdvisory),
    position: position(a),
    lastPosition: last && { lat: last.latDeg, lon: last.lonDeg },
    source: source(a),
    alt: a.airGroundState === AirGroundState.ON_GROUND ? 'ground' : a.baroAltitudeFt,
    gs: a.groundSpeedKt,
    track: a.trackDeg,
    heading: a.magneticHeadingDeg,
    verticalRate: a.baroVerticalRateFpm ?? a.geometricVerticalRateFpm,
    ias: a.indicatedAirspeedKt,
    tas: a.trueAirspeedKt,
    mach: a.mach,
    selAlt: target?.selectedAltitudeMcpFt,
    fmsAlt: target?.selectedAltitudeFmsFt,
    selHeading: target?.selectedHeadingDeg,
    navQnh: target?.baroSettingHpa,
    navModes: modes && MODES.filter(([mode]) => modes[mode]).map(([, name]) => name),
    nic: a.quality?.nic,
    nacP: a.quality?.nacP,
    windSpeed: a.meteo?.windSpeedKt,
    windDir: a.meteo?.windDirDeg,
    oat: a.meteo?.oatC,
    tat: a.meteo?.tatC,
    registration: a.registry?.registration,
    type: a.registry?.typeDesignator,
    description: a.registry?.typeDescription,
    messages: a.reception?.messages === undefined ? undefined : Number(a.reception.messages),
    rssi: a.reception?.rssiDbfs,
    seen: a.reception?.seenS,
    seenPos: a.reception?.seenPosS,
  };
  return withoutUnknown(report);
}

/** Drops the keys whose value is unknown, so that what is not known is absent. */
function withoutUnknown<T extends object>(record: Loose<T>): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dropping optional keys keeps the type
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as T;
}

/** A frame of the feed as the scope reads it. */
export type FeedMessage =
  | { kind: 'hello'; receiver: ReceiverPosition; history: AircraftSnapshot[] }
  | { kind: 'snapshot'; snapshot: AircraftSnapshot };

function toSnapshot({ nowS, messages, aircraft }: Snapshot): AircraftSnapshot {
  return { now: nowS, messages: Number(messages), aircraft: aircraft.map(toReport) };
}

export function messageOf({ body }: Frame): FeedMessage {
  switch (body.case) {
    case 'hello': {
      const { receiver, history } = body.value;
      return {
        kind: 'hello',
        receiver: withoutUnknown({ lat: receiver?.latDeg, lon: receiver?.lonDeg }),
        history: history.map(toSnapshot),
      };
    }
    case 'snapshot':
      return { kind: 'snapshot', snapshot: toSnapshot(body.value) };
    default:
      throw new Error('feed: empty frame');
  }
}
