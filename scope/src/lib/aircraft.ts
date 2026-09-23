/**
 * The subset of readsb's `aircraft.json` that the scope reads.
 * See wiedehopf/readsb README-json.md. Every field is optional because
 * readsb omits what it does not know.
 */
export interface AircraftJson {
  hex: string;
  flight?: string;
  squawk?: string;
  category?: string;
  lat?: number;
  lon?: number;
  /** Barometric altitude in feet, or the literal "ground". */
  alt_baro?: number | 'ground';
  /** Geometric (GNSS) altitude in feet; often the first altitude readsb has. */
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  seen?: number;
  seen_pos?: number;
  /** Fields whose value came from MLAT. */
  mlat?: string[];
  /** Fields whose value came from TIS-B. */
  tisb?: string[];
  lastPosition?: { lat: number; lon: number; nic?: number; rc?: number; seen_pos: number };
  rr_lat?: number;
  rr_lon?: number;
  nic?: number;
  nac_p?: number;
  messages?: number;
  rssi?: number;
  /** Type designator, present when readsb enrichment is on. */
  t?: string;
  /** Registration, present when readsb enrichment is on. */
  r?: string;
  /** Long type description, present when readsb enrichment is on. */
  desc?: string;
  /** Emergency status: none, general, lifeguard, minfuel, nordo, unlawful, downed, reserved. */
  emergency?: string;
  /** Air data speeds: true and indicated airspeed in knots, Mach number. */
  tas?: number;
  ias?: number;
  mach?: number;
  /** Wind readsb derives from air data, knots and degrees true. */
  ws?: number;
  wd?: number;
  /** Outside and total air temperature, degrees Celsius. */
  oat?: number;
  tat?: number;
}

export interface AircraftSnapshot {
  now: number;
  messages: number;
  aircraft: AircraftJson[];
}

export interface ReceiverJson {
  lat?: number;
  lon?: number;
  version?: string;
  refresh?: number;
}
