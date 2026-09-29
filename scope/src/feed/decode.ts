import type { AircraftJson, AircraftSnapshot, ReceiverJson } from '../lib/aircraft';
import {
  AddressType,
  type Aircraft,
  AirGroundState,
  type Frame,
  type Snapshot,
  Source,
  type TargetState_Modes,
} from './gen/papaquebec/feed/v1/feed_pb';

/** readsb's names for the emergency/priority status codes 0 to 7. */
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

/** readsb's names for the modes, by the feed's. */
const MODES: [keyof TargetState_Modes, string][] = [
  ['autopilot', 'autopilot'],
  ['vnav', 'vnav'],
  ['altitudeHold', 'althold'],
  ['approach', 'approach'],
  ['lnav', 'lnav'],
  ['tcas', 'tcas'],
];

/** The fields readsb lists under `mlat` or `tisb` when the position came that way. */
const POSITION_FIELDS = ['lat', 'lon'];

function hex(a: Aircraft): string {
  const digits = (a.address?.value ?? 0).toString(16).padStart(6, '0');
  return a.address?.type === AddressType.NON_ICAO ? `~${digits}` : digits;
}

/** `A0` to `D7` from the feed's `set * 8 + code`. */
function category(code: number): string {
  return `${'ABCD'[code >> 3] ?? '?'}${code & 7}`;
}

/** Every key of `T`, each known or not: what is built before the unknown ones are dropped. */
type Loose<T> = { [K in keyof T]-?: T[K] | undefined };

function toAircraftJson(a: Aircraft): AircraftJson {
  const target = a.targetState;
  const modes = target?.modes;
  const last = a.lastPosition;
  const json: Loose<AircraftJson> = {
    hex: hex(a),
    flight: a.identification,
    squawk: a.modeACode?.toString(8).padStart(4, '0'),
    category: a.emitterCategory === undefined ? undefined : category(a.emitterCategory),
    emergency:
      a.emergencyPriorityStatus === undefined ? undefined : EMERGENCIES[a.emergencyPriorityStatus],
    lat: a.latDeg,
    lon: a.lonDeg,
    alt_baro: a.airGroundState === AirGroundState.ON_GROUND ? 'ground' : a.baroAltitudeFt,
    alt_geom: a.geometricAltitudeFt,
    mlat: a.positionSource === Source.MLAT ? POSITION_FIELDS : undefined,
    tisb: a.positionSource === Source.TISB ? POSITION_FIELDS : undefined,
    rr_lat: a.roughPosition?.latDeg,
    rr_lon: a.roughPosition?.lonDeg,
    lastPosition:
      last &&
      withoutUnknown({
        lat: last.latDeg,
        lon: last.lonDeg,
        nic: last.nic,
        rc: last.rcM,
        seen_pos: last.seenPosS,
      }),
    gs: a.groundSpeedKt,
    track: a.trackDeg,
    baro_rate: a.baroVerticalRateFpm,
    ias: a.indicatedAirspeedKt,
    tas: a.trueAirspeedKt,
    mach: a.mach,
    nav_altitude_mcp: target?.selectedAltitudeMcpFt,
    nav_altitude_fms: target?.selectedAltitudeFmsFt,
    nav_heading: target?.selectedHeadingDeg,
    nav_qnh: target?.baroSettingHpa,
    nav_modes: modes && MODES.filter(([mode]) => modes[mode]).map(([, name]) => name),
    nic: a.quality?.nic,
    nac_p: a.quality?.nacP,
    ws: a.meteo?.windSpeedKt,
    wd: a.meteo?.windDirDeg,
    oat: a.meteo?.oatC,
    tat: a.meteo?.tatC,
    r: a.registry?.registration,
    t: a.registry?.typeDesignator,
    desc: a.registry?.typeDescription,
    messages: a.reception?.messages === undefined ? undefined : Number(a.reception.messages),
    rssi: a.reception?.rssiDbfs,
    seen: a.reception?.seenS,
    seen_pos: a.reception?.seenPosS,
  };
  return withoutUnknown(json);
}

/** Drops the keys whose value is unknown, as readsb omits them. */
function withoutUnknown<T extends object>(record: Loose<T>): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dropping optional keys keeps the type
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined)) as T;
}

/** A frame of the feed in the shapes the scope ingests: readsb's JSON. */
export type FeedMessage =
  | { kind: 'hello'; receiver: ReceiverJson; history: AircraftSnapshot[] }
  | { kind: 'snapshot'; snapshot: AircraftSnapshot };

function toSnapshot({ nowS, messages, aircraft }: Snapshot): AircraftSnapshot {
  return { now: nowS, messages: Number(messages), aircraft: aircraft.map(toAircraftJson) };
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
