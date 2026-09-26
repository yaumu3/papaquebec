export type Source = 'adsb' | 'mlat' | 'tisb';

export type Corner = 'ne' | 'nw' | 'se' | 'sw';

/** Where a track's position came from, in decreasing order of trust. */
export type Position =
  | { kind: 'live'; lat: number; lon: number; x: number; y: number }
  | { kind: 'last'; lat: number; lon: number; x: number; y: number }
  | { kind: 'rr'; lat: number; lon: number }
  | { kind: 'none' };

export interface Fix {
  lat: number;
  lon: number;
  x: number;
  y: number;
  /** Snapshot time, seconds since epoch. */
  t: number;
  alt: number | 'ground' | undefined;
}

/** Per-track state the operator sets; survives snapshot rebuilds. */
export interface OperatorState {
  hideTrail: boolean;
  /** Corner the operator pinned, or null for automatic placement. */
  pinnedCorner: Corner | null;
  /** Corner the automatic placer last chose; kept so blocks stay put until they collide. */
  autoCorner: Corner;
}

export interface Track {
  hex: string;
  flight: string | undefined;
  squawk: string | undefined;
  category: string | undefined;
  alt: number | 'ground' | undefined;
  gs: number | undefined;
  track: number | undefined;
  baroRate: number | undefined;
  nic: number | undefined;
  nacP: number | undefined;
  messages: number | undefined;
  rssi: number | undefined;
  type: string | undefined;
  registration: string | undefined;
  description: string | undefined;
  emergency: string | undefined;
  /** Air data speeds: true and indicated airspeed in knots, Mach number. */
  tas: number | undefined;
  ias: number | undefined;
  mach: number | undefined;
  /** Wind derived by readsb, knots and degrees true. */
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
  /** Engaged modes as readsb names them, e.g. autopilot, vnav, lnav. */
  navModes: string[] | undefined;
  source: Source;
  seen: number;
  seenPos: number | undefined;
  position: Position;
  history: Fix[];
  ops: OperatorState;
}
