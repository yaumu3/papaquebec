import type { ResolutionAdvisory, Threat } from '../lib/acas';
import type { AircraftReport, AircraftSnapshot, Heard, ReceiverPosition } from '../lib/aircraft';
import type { StationReport } from '../lib/metar';
import {
  AddressType,
  type Aircraft,
  type Frame,
  type Position,
  type Qnh,
  type Snapshot,
  Source,
} from './gen/papaquebec/feed/v2/feed_pb';

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

type Mode = 'autopilot' | 'vnav' | 'altitudeHold' | 'approach' | 'lnav' | 'tcas';

/** The names the scope knows the modes by, in the order it lists them. */
const MODES: [Mode, string][] = [
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

function source(p: Position | undefined): AircraftReport['source'] {
  if (p?.source === Source.MLAT) return 'mlat';
  if (p?.source === Source.TISB) return 'tisb';
  return undefined;
}

/** A report's instant as the scope keeps time: seconds since the epoch; unknown without a report. */
function heardAt(report: { heardMs: bigint } | undefined): number | undefined {
  return report === undefined ? undefined : Number(report.heardMs) / 1000;
}

/** When a value of a group was reported: with the group, as long as the value is known. */
function when(value: unknown, group: { heardMs: bigint } | undefined): number | undefined {
  return value === undefined ? undefined : heardAt(group);
}

/** A message as plain data, without the type name protobuf-es stamps on it. */
function plain<T extends { $typeName: string }>(message: T): Omit<T, '$typeName'> {
  const fields = Object.entries(message).filter(([key]) => key !== '$typeName');
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dropping the type name keeps the fields
  return Object.fromEntries(fields) as Omit<T, '$typeName'>;
}

/** The threat as the scope reads it: the address as six hex digits, or the estimates known. */
function threatOf(threat: NonNullable<Aircraft['advisory']>['threat']): Threat | undefined {
  switch (threat.case) {
    case 'threatAddress':
      return { address: threat.value.toString(16).padStart(6, '0') };
    case 'threatPosition': {
      const { altitudeFt, rangeNm, bearingDeg } = threat.value;
      const placed = withoutUnknown({ altitude: altitudeFt, range: rangeNm, bearing: bearingDeg });
      // Placed, but with no estimate at all, it is as good as not identified.
      return Object.keys(placed).length === 0 ? undefined : placed;
    }
    default:
      return undefined;
  }
}

/** The advisory as the scope reads it, its nested messages plain too. */
function advisoryOf(ra: Aircraft['advisory']): ResolutionAdvisory | undefined {
  if (ra === undefined) return undefined;
  const { resolution, corrections, multipleThreats, terminated } = ra;
  const threat = threatOf(ra.threat);
  return {
    multipleThreats,
    terminated,
    ...(resolution && { advisory: plain(resolution) }),
    ...(corrections && { corrections: plain(corrections) }),
    ...(threat && { threat }),
  };
}

/** Every key of `T`, each known or not: what is built before the unknown ones are dropped. */
type Loose<T> = { [K in keyof T]-?: T[K] | undefined };

function toReport(a: Aircraft): AircraftReport {
  const id = a.identification;
  const p = a.position;
  const modes = a.modes;
  const reception = a.reception;
  const grounded = a.onGround?.value === true;
  const altitude = grounded ? a.onGround : a.baroAltitudeFt;
  const verticalRate = a.baroVerticalRateFpm ?? a.geometricVerticalRateFpm;
  const report: Loose<Omit<AircraftReport, 'heard'>> = {
    hex: hex(a),
    flight: id?.callsign,
    squawk: a.modeACode?.value.toString(8).padStart(4, '0'),
    category: id?.emitterCategory === undefined ? undefined : category(id.emitterCategory),
    emergency: a.emergency === undefined ? undefined : EMERGENCIES[a.emergency.status],
    ident: a.ident?.value,
    ra: advisoryOf(a.advisory),
    position: p && { lat: p.latDeg, lon: p.lonDeg },
    source: source(p),
    alt: grounded ? 'ground' : a.baroAltitudeFt?.value,
    gs: a.groundSpeedKt?.value,
    track: a.trackDeg?.value,
    heading: a.magneticHeadingDeg?.value,
    verticalRate: verticalRate?.value,
    roll: a.rollDeg?.value,
    trackRate: a.trackRateDegPerS?.value,
    ias: a.indicatedAirspeedKt?.value,
    tas: a.trueAirspeedKt?.value,
    mach: a.mach?.value,
    selAlt: a.selectedAltitudeMcpFt?.value,
    fmsAlt: a.selectedAltitudeFmsFt?.value,
    selHeading: a.selectedHeadingDeg?.value,
    navQnh: a.baroSettingHpa?.value,
    navModes: modes && MODES.filter(([mode]) => modes[mode]).map(([, name]) => name),
    nic: p?.nic,
    rc: p?.rcM,
    nacP: a.nacP?.value,
    windSpeed: a.windSpeedKt?.value,
    windDir: a.windDirDeg?.value,
    oat: a.oatC?.value,
    tat: a.tatC?.value,
    registration: a.registry?.registration,
    type: a.registry?.typeDesignator,
    description: a.registry?.typeDescription,
    messages: reception === undefined ? undefined : Number(reception.messages),
    rssi: reception?.rssiDbfs,
  };
  const heard: Loose<Heard> = {
    flight: when(id?.callsign, id),
    category: when(id?.emitterCategory, id),
    squawk: heardAt(a.modeACode),
    emergency: heardAt(a.emergency),
    ident: heardAt(a.ident),
    ra: heardAt(a.advisory),
    position: heardAt(p),
    nic: heardAt(p),
    rc: when(p?.rcM, p),
    alt: heardAt(altitude),
    gs: heardAt(a.groundSpeedKt),
    track: heardAt(a.trackDeg),
    heading: heardAt(a.magneticHeadingDeg),
    verticalRate: heardAt(verticalRate),
    roll: heardAt(a.rollDeg),
    trackRate: heardAt(a.trackRateDegPerS),
    ias: heardAt(a.indicatedAirspeedKt),
    tas: heardAt(a.trueAirspeedKt),
    mach: heardAt(a.mach),
    selAlt: heardAt(a.selectedAltitudeMcpFt),
    fmsAlt: heardAt(a.selectedAltitudeFmsFt),
    selHeading: heardAt(a.selectedHeadingDeg),
    navQnh: heardAt(a.baroSettingHpa),
    navModes: heardAt(modes),
    nacP: heardAt(a.nacP),
    windSpeed: heardAt(a.windSpeedKt),
    windDir: heardAt(a.windDirDeg),
    oat: heardAt(a.oatC),
    tat: heardAt(a.tatC),
    messages: heardAt(reception),
    rssi: when(reception?.rssiDbfs, reception),
  };
  return { ...withoutUnknown(report), heard: withoutUnknown(heard) };
}

/** Drops the keys whose value is unknown, so that what is not known is absent. */
function withoutUnknown<T extends object>(record: Loose<T>): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dropping optional keys keeps the type
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as T;
}

/** A frame of the feed as the scope reads it. */
export type FeedMessage =
  | { kind: 'hello'; receiver: ReceiverPosition; history: AircraftSnapshot[] }
  | { kind: 'snapshot'; snapshot: AircraftSnapshot }
  /** The current reports of the stations around the receiver, all of them, every time. */
  | { kind: 'weather'; reports: StationReport[] };

function toSnapshot({ nowMs, messages, aircraft }: Snapshot): AircraftSnapshot {
  return {
    now: Number(nowMs) / 1000,
    messages: Number(messages),
    aircraft: aircraft.map(toReport),
  };
}

function toStationReport(q: Qnh): StationReport {
  return {
    station: q.station,
    lat: q.latDeg,
    lon: q.lonDeg,
    observedAt: Number(q.observedMs),
    qnhInHg: q.qnhInHg,
  };
}

/** The frame as the scope reads it; null for one it does not know, as a later feeder may send. */
export function messageOf({ body }: Frame): FeedMessage | null {
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
    case 'weather':
      return { kind: 'weather', reports: body.value.qnh.map(toStationReport) };
    default:
      return null;
  }
}
