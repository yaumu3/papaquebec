import type { ResolutionAdvisory } from '../lib/acas';
import type { Heard, PositionSource } from '../lib/aircraft';
import type { GeoPoint } from '../lib/geo';

export type Source = PositionSource;

/** Where the track is: its position while the feed reports one, else nowhere. */
export type Position =
  | { kind: 'live'; lat: number; lon: number; x: number; y: number }
  | { kind: 'none' };

export interface Fix {
  lat: number;
  lon: number;
  x: number;
  y: number;
  /** When the position was heard, seconds since the epoch. */
  t: number;
  alt: number | 'ground' | undefined;
}

/** Per-track state the operator sets; survives snapshot rebuilds. */
export interface OperatorState {
  /** Direction the data block sits at, set by the placer or by a drag; null until placed. */
  dir: number | null;
  /** Snapshot time the block last moved, seconds; null until placed. */
  movedAt: number | null;
  /**
   * The block sits where the operator dragged it: the placer moves it only to clear a hard
   * conflict, and once it has, the block is the placer's again.
   */
  manual: boolean;
}

/** What the feed reports of the aircraft's state at one instant, as the detail panel reads it. */
export interface Readings {
  alt: number | 'ground' | undefined;
  gs: number | undefined;
  track: number | undefined;
  /** Magnetic heading, degrees. */
  heading: number | undefined;
  /** In fpm: the barometric rate, or the geometric one from an aircraft that reports no other. */
  verticalRate: number | undefined;
  /** Bank in degrees and how fast the track turns in degrees per second, both positive to the right. */
  roll: number | undefined;
  trackRate: number | undefined;
  nic: number | undefined;
  /** The radius of containment the NIC stands for, in metres. */
  rc: number | undefined;
  nacP: number | undefined;
  /** Messages heard from it since the receiver started. */
  messages: number | undefined;
  rssi: number | undefined;
  /** Air data speeds: true and indicated airspeed in knots, Mach number. */
  tas: number | undefined;
  ias: number | undefined;
  mach: number | undefined;
  /** Wind, knots and degrees true. */
  windSpeed: number | undefined;
  windDir: number | undefined;
  /** Outside and total air temperature, degrees Celsius. */
  oat: number | undefined;
  tat: number | undefined;
  /** Downlinked autopilot intent: MCP/FCU and FMS altitudes in feet, heading, crew QNH in hPa. */
  selAlt: number | undefined;
  fmsAlt: number | undefined;
  selHeading: number | undefined;
  navQnh: number | undefined;
  /** The engaged modes by name, e.g. autopilot, vnav, lnav. */
  navModes: string[] | undefined;
  source: Source;
  /** Seconds since its last message, and since its last position. */
  seen: number;
  seenPos: number | undefined;
  /** When each reading was last reported. */
  heard: Heard;
  /** Where it was when heard. */
  at: GeoPoint | undefined;
}

/** The readings as they stood when the target was heard, kept for the history lanes. */
export interface Sample extends Readings {
  /** Snapshot time, seconds since epoch. */
  t: number;
  /** Messages per second since the sample before; unknown for the first. */
  messageRate: number | undefined;
}

/** What the detail table prints of a target or of a sample: the readings and the message rate. */
export type Readout = Omit<Sample, 't'>;

export interface Track extends Readings {
  hex: string;
  /** Messages per second as of its latest sample. */
  messageRate: number | undefined;
  flight: string | undefined;
  squawk: string | undefined;
  category: string | undefined;
  type: string | undefined;
  registration: string | undefined;
  description: string | undefined;
  emergency: string | undefined;
  /** The crew pressed IDENT, and the transponder still signals it. */
  ident: boolean;
  /** The active resolution advisory, while its report is fresh. */
  ra: ResolutionAdvisory | undefined;
  position: Position;
  history: Fix[];
  /** One sample per snapshot in which the target was heard, oldest first. */
  samples: Sample[];
  ops: OperatorState;
}
