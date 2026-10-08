/**
 * What the feed tells of the aircraft a receiver hears, as the scope reads it. A field is absent
 * when the receiver does not know it.
 */

/** How a position came: by the aircraft's own broadcast, by multilateration, or rebroadcast from the ground. */
export type PositionSource = 'adsb' | 'mlat' | 'tisb';

export interface LatLon {
  lat: number;
  lon: number;
}

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
  /** The crew pressed IDENT, which the transponder signals for 18 s. */
  ident?: true;
  /** Where it reports being. */
  position?: LatLon;
  /** Where it last reported being, once that is no longer current. */
  lastPosition?: LatLon;
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
  nic?: number;
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
  /** Seconds since its last message, and since its last position. */
  seen?: number;
  seenPos?: number;
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
