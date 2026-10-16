import type { ResolutionAdvisory } from './acas';

/**
 * What the feed tells of the aircraft a receiver hears, as the scope reads it. A field is absent
 * when the receiver does not know it, or when its report has lapsed.
 */

/** How a position came: by the aircraft's own broadcast, by multilateration, or rebroadcast from the ground. */
export type PositionSource = 'adsb' | 'mlat' | 'tisb';

export interface LatLon {
  lat: number;
  lon: number;
}

/** Every reading the feed reports with an instant, by the key the scope reads it under. */
export type HeardKey =
  | 'flight'
  | 'category'
  | 'squawk'
  | 'emergency'
  | 'ident'
  | 'ra'
  | 'position'
  | 'nic'
  | 'rc'
  | 'alt'
  | 'gs'
  | 'track'
  | 'heading'
  | 'verticalRate'
  | 'ias'
  | 'tas'
  | 'mach'
  | 'roll'
  | 'trackRate'
  | 'selAlt'
  | 'fmsAlt'
  | 'selHeading'
  | 'navQnh'
  | 'navModes'
  | 'nacP'
  | 'windSpeed'
  | 'windDir'
  | 'oat'
  | 'tat'
  | 'messages'
  | 'rssi';

/**
 * When each reading was last reported, seconds since the epoch; absent with the reading. The
 * readings of one report share an instant: the position with its integrity, the identification,
 * the modes. `messages` is the last message of any kind.
 */
export type Heard = Partial<Record<HeardKey, number>>;

export interface AircraftReport {
  /** The six hex digits of the address, after `~` when it is not one ICAO assigned. */
  hex: string;
  flight?: string;
  /** The Mode A code as four octal digits. */
  squawk?: string;
  /** Emitter category, `A0` to `D7`. */
  category?: string;
  /** Emergency/priority status by name; `none` when the aircraft reports that it has none. */
  emergency?: string;
  /** The special position identification, as last reported: the crew pressed IDENT. */
  ident?: boolean;
  /** The resolution advisory, as last reported. */
  ra?: ResolutionAdvisory;
  /** Where it reports being, while that report holds. */
  position?: LatLon;
  /** How the position came, when not by the aircraft's own broadcast. */
  source?: Exclude<PositionSource, 'adsb'>;
  /** Pressure altitude in feet, or that it reports being on the ground. */
  alt?: number | 'ground';
  gs?: number;
  track?: number;
  /** Magnetic heading, degrees. */
  heading?: number;
  /** In fpm: the barometric rate, or the geometric one from an aircraft that reports no other. */
  verticalRate?: number;
  /** Bank in degrees, positive to the right. */
  roll?: number;
  /** How fast the track turns, degrees per second, positive to the right. */
  trackRate?: number;
  nic?: number;
  /** The radius of containment the NIC stands for, in metres. */
  rc?: number;
  nacP?: number;
  messages?: number;
  rssi?: number;
  /** ICAO type designator, registration and long type description, from the aircraft database. */
  type?: string;
  registration?: string;
  description?: string;
  /** Air data speeds: true and indicated airspeed in knots, Mach number. */
  tas?: number;
  ias?: number;
  mach?: number;
  /** Wind, knots and degrees true. */
  windSpeed?: number;
  windDir?: number;
  /** Outside and total air temperature, degrees Celsius. */
  oat?: number;
  tat?: number;
  /** Downlinked autopilot intent: MCP/FCU and FMS altitudes in feet, heading, crew QNH in hPa. */
  selAlt?: number;
  fmsAlt?: number;
  selHeading?: number;
  navQnh?: number;
  /** The engaged modes by name, e.g. autopilot, vnav, lnav; absent when the aircraft reports none. */
  navModes?: string[];
  heard: Heard;
}

export interface AircraftSnapshot {
  /** Seconds since the epoch. */
  now: number;
  /** Messages the receiver has decoded since it started. */
  messages: number;
  aircraft: AircraftReport[];
}

/** Where the receiver is, when it knows. */
export type ReceiverPosition = Partial<LatLon>;
