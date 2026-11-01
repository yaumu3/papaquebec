/**
 * The fictional fleet the visual tests fly: every flight a function of how long ago, so that each
 * run brings the same history. It reaches the scope in place of the feed worker, as the events
 * that worker posts, and a stand-in places the blocks in place of the placer's worker.
 */
import type { FeedEvent } from '../../src/feed/feedWorker';
import type { ResolutionAdvisory } from '../../src/lib/acas';
import type { AircraftReport, AircraftSnapshot, HeardKey, LatLon } from '../../src/lib/aircraft';
import { NE } from '../../src/lib/datablock';
import { latLonOf, type Place } from './grid';

const HISTORY_SEC = 900;
const STEP_SEC = 5;
const MESSAGES_PER_SEC = 4;
const SEC_PER_HOUR = 3600;

type Reading = Partial<Omit<AircraftReport, 'hex' | 'position' | 'heard'>>;

export interface Flight {
  id: Reading & { hex: string };
  /** Where it is now, in NM east and north of the site. */
  at: Place;
  /** What it reports `age` seconds before now, or nothing while it is not heard. */
  reads: (age: number) => Reading | null;
  /** Heard no later than this many seconds ago. */
  silentSec?: number;
  /** How much older than the rest of a report these readings are. */
  lagSec?: Partial<Record<HeardKey, number>>;
  /** Where its block sits, if not north-east. */
  bearing?: number;
}

const level = (alt: number | 'ground', track: number, gs: number): Reading => ({
  alt,
  track,
  gs,
  verticalRate: 0,
  nic: 8,
  nacP: 9,
  rssi: -14,
});

/** All an air data report holds, at one speed and level. */
const airData = (alt: number): Reading => ({
  ias: 280 - alt / 1000,
  tas: 330,
  mach: 0.52,
  windSpeed: 40 - alt / 1000,
  windDir: 270,
  oat: -2 - alt / 500,
  tat: 8 - alt / 500,
  navQnh: 1013.2,
});

const LEAD_CLIMB_SEC = 300;
const LEAD_TURN_SEC = 15;
const LEAD_FPS = 20;
const LEAD_ALT = 12_000;
const MODE_CHANGE_SEC = 6;

/** Climbing out of a level stretch, turning onto its selected heading: every reading there is. */
function leadReads(age: number): Reading {
  const climbing = age < LEAD_CLIMB_SEC;
  const turning = age < LEAD_TURN_SEC;
  const alt = LEAD_ALT - LEAD_FPS * Math.min(age, LEAD_CLIMB_SEC);
  const track = 75 - Math.min(age, LEAD_TURN_SEC);
  return {
    ...level(alt, track, 340 - alt / 1000),
    ...airData(alt),
    heading: track + 4,
    verticalRate: climbing ? 1200 : 0,
    roll: turning ? 18 : 0,
    trackRate: turning ? 1.5 : 0,
    rc: 186,
    nacP: 10,
    rssi: -12 - 4 * Math.sin(age / 60),
    selAlt: climbing ? 14_000 : 6000,
    fmsAlt: 24_000,
    selHeading: 90,
    navModes: climbing
      ? ['autopilot', ...(age < MODE_CHANGE_SEC ? ['vnav'] : [])]
      : ['autopilot', 'althold'],
  };
}

/** Descending and turning left through north, its selections well off to the left and below. */
const descentReads = (): Reading => ({
  ...level(7000, 355, 240),
  ...airData(7000),
  heading: 350,
  verticalRate: -2200,
  roll: -25,
  trackRate: -2,
  selAlt: 3000,
  fmsAlt: 6600,
  selHeading: 240,
  navModes: ['autopilot', 'vnav'],
  emergency: 'minfuel',
  windDir: 350,
});

/** Past the ends of every scale: under sea level, slow, climbing and banking as hard as they go. */
const extremeReads = (): Reading => ({
  ...level(-300, 10, 80),
  ...airData(0),
  ias: 15,
  mach: 0.1,
  heading: 12,
  verticalRate: 6500,
  roll: 55,
  trackRate: 3,
  selAlt: 5000,
  selHeading: 170,
  navModes: ['autopilot'],
  windDir: 90,
});

/** A glyph lane reads one sample each this far apart, so each stretch fills one. */
const GLYPH_SEC = 120;
/**
 * What each stretch reports of the heading and the wind, newest first; the rest stay out. Each
 * stands about a tick of the lane, which would take a heading from a neighbour just past its edge.
 * The newest is not read, a tick there standing too near the plot's edge to be drawn whole.
 */
const GLYPH_STRETCHES: readonly Reading[] = [
  { track: 100, heading: 95, selHeading: 180 },
  { track: 100, heading: 95, selHeading: 180, windSpeed: 1 },
  { track: 100, heading: 95, selHeading: 0, windSpeed: 7 },
  { track: 100, heading: 180, selHeading: 180.5, windSpeed: 12 },
  { track: 100, selHeading: 100, windSpeed: 27 },
  { track: 100, windSpeed: 55 },
  { heading: 95, windSpeed: 78 },
  { track: 100, heading: 95 },
];
const GLYPH_GAP_SEC = { from: 650, to: 690 };

/** Each glyph its lanes draw in turn, with a gap among them. */
function glyphReads(age: number): Reading | null {
  if (age > GLYPH_GAP_SEC.from && age < GLYPH_GAP_SEC.to) return null;
  const { track: _, ...levelFlight } = level(21_000, 0, 380);
  const { windSpeed: __, ...air } = airData(21_000);
  const stretch = GLYPH_STRETCHES[Math.floor((age + GLYPH_SEC / 2) / GLYPH_SEC)] ?? {};
  return { ...levelFlight, ...air, navModes: ['autopilot'], windDir: 310, ...stretch };
}

/** On the ground for the last five minutes, after an approach. */
function arrivalReads(age: number): Reading {
  const landed = age < 300;
  return level(landed ? 'ground' : (age - 300) * 8, 160, landed ? 12 : 140);
}

/** A thousand so near the top of the tape that the bar above it falls off. */
const TAPE_EDGE_ALT = 12_575;
/** Short of a round figure, so the readout's wheels are caught between digits. */
const CARRY_ALT = 13_985;
const CARRY_IAS = 249.7;

const threat = (of: ResolutionAdvisory['threat']): ResolutionAdvisory => ({
  multipleThreats: false,
  advisory: {
    corrective: true,
    downward: false,
    increasedRate: false,
    senseReversal: false,
    altitudeCrossing: false,
    positive: true,
  },
  terminated: false,
  ...(of ? { threat: of } : {}),
});

/** The whole fleet, close enough to appear on each other's ND. */
export const FLEET: readonly Flight[] = [
  {
    id: {
      hex: 'd10001',
      flight: 'TEST01',
      type: 'B789',
      registration: 'TEST-01',
      description: 'Boeing 787-9',
      category: 'A5',
      squawk: '2431',
    },
    at: [-12, 10],
    reads: leadReads,
  },
  {
    id: { hex: 'd10002', flight: 'TEST02', type: 'A320', registration: 'TEST-02', category: 'A3' },
    at: [-8, 12],
    reads: () => level(TAPE_EDGE_ALT, 250, 300),
  },
  {
    id: { hex: 'd1000b', flight: 'TEST03', type: 'A21N', category: 'A3' },
    at: [-7, 9],
    reads: () => ({ ...level(11_200, 280, 310), verticalRate: 800 }),
  },
  {
    id: { hex: 'd1000c', flight: 'TEST04', type: 'B38M', category: 'A3' },
    at: [-4, 18],
    reads: () => ({ ...level(CARRY_ALT, 230, 330), ias: CARRY_IAS, verticalRate: -800 }),
  },
  {
    id: { hex: 'd10003', flight: 'TEST05', type: 'B738', category: 'A3', squawk: '7700' },
    at: [14, 16],
    reads: () => ({
      ...level(9000, 200, 260),
      heading: 200,
      verticalRate: -1600,
      emergency: 'general',
      ident: true,
      ra: threat({ address: 'd1000d' }),
    }),
  },
  {
    id: { hex: 'd1000d', flight: 'TEST06', type: 'A333', category: 'A5' },
    at: [12, 11],
    reads: () => level(9400, 20, 280),
  },
  {
    id: { hex: 'd10004', flight: 'TEST07', type: 'E190', category: 'A3', squawk: '7600' },
    at: [22, -6],
    reads: () => ({
      ...level(16_000, 310, 320),
      heading: 310,
      selAlt: 16_000,
      navQnh: 1013.2,
      ra: threat({ altitude: 16_700, range: 6, bearing: 40 }),
    }),
  },
  {
    id: { hex: 'd10005', flight: 'TEST08', type: 'DH8D', category: 'A2' },
    at: [-20, -14],
    reads: descentReads,
  },
  {
    id: { hex: 'd1000e', flight: 'TEST09', type: 'C172', category: 'A1' },
    at: [28, 8],
    reads: extremeReads,
  },
  {
    id: { hex: 'd1000f', flight: 'TEST10', type: 'B744', category: 'A5' },
    at: [-30, 16],
    reads: glyphReads,
  },
  {
    id: { hex: 'd10006', flight: 'TEST11', type: 'B77W', category: 'A5' },
    at: [1, 0.5],
    reads: arrivalReads,
  },
  {
    id: { hex: 'd10007', registration: 'TEST-12', category: 'A1' },
    at: [8, -18],
    reads: () => ({ ...level(4500, 120, 130), source: 'mlat' }),
  },
  {
    id: { hex: 'd10008', category: 'A1' },
    at: [-26, 2],
    reads: () => ({ ...level(3500, 80, 110), source: 'tisb' }),
  },
  {
    id: { hex: 'd10009', flight: 'TEST13', type: 'A359', category: 'A5' },
    at: [18, 22],
    reads: () => level(33_000, 95, 450),
    lagSec: { position: 30 },
  },
  {
    id: { hex: 'd1000a', flight: 'TEST14', type: 'B752', category: 'A4' },
    at: [-2, -24],
    reads: () => level(25_000, 20, 400),
    silentSec: 40,
  },
];

/** Where the flight of `callsign` is now. */
export function placeOf(callsign: string): Place {
  const flight = FLEET.find(({ id }) => id.flight === callsign);
  if (!flight) throw new Error(`no flight ${callsign}`);
  return flight.at;
}

/** Sinking fast and crabbing far: past two edges of the attitude, the heading just off the ND's arc. */
export const DRIFTING: Flight = {
  id: { hex: 'd10010', flight: 'TEST15', type: 'C172', category: 'A1' },
  at: [0, 0],
  reads: () => ({
    ...level(8000, 100, 80),
    ...airData(8000),
    heading: 23,
    verticalRate: -6000,
    roll: 0,
    trackRate: 0,
  }),
};

/** The bearing of a block due west of its target. */
const WEST = 4;

const LONE_ID: Flight['id'] = {
  hex: 'd20001',
  flight: 'TEST01',
  type: 'B789',
  registration: 'TEST-01',
  category: 'A3',
  squawk: '2431',
};
const LONE_LEVEL = level(11_000, 135, 290);
const ADVISORY = threat(undefined);

/** A flight alone at the site reporting `reads` over a level flight; `id` in place of its own. */
const lone = (reads: Reading, id: Flight['id'] = LONE_ID): Flight => ({
  id,
  at: [0, 0],
  reads: () => ({ ...LONE_LEVEL, ...reads }),
});

/** A level flight alone at the site, with a block as plain as they come. */
export const LONE = lone({});

/** One flight for each state of a data block or a target, by the name of its image. */
export const LONE_FLIGHTS: Readonly<Record<string, Flight>> = {
  level: LONE,
  ...Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6, 7].map((bearing) => [`bearing-${bearing}`, { ...LONE, bearing }]),
  ),
  'all-tags-west': {
    ...lone({ emergency: 'lifeguard', ra: ADVISORY, ident: true }, { ...LONE_ID, squawk: '7700' }),
    bearing: WEST,
  },
  'climbing-west': { ...lone({ verticalRate: 1500, selAlt: 16_000 }), bearing: WEST },
  selected: { ...LONE, reads: (age) => (age > 90 ? null : LONE.reads(age)) },
  hovered: LONE,
  dropped: LONE,
  'filtered-low': lone({ alt: 3000 }),
  climbing: lone({ verticalRate: 1500, selAlt: 16_000 }),
  descending: lone({ verticalRate: -1500, selAlt: 8000 }),
  'level-held': lone({ alt: 34_860, selAlt: 35_000, navQnh: 1013.2 }),
  heading: lone({ selHeading: 95, navModes: ['autopilot'] }),
  general: lone({}, { ...LONE_ID, squawk: '7700' }),
  radio: lone({}, { ...LONE_ID, squawk: '7600' }),
  hijack: lone({}, { ...LONE_ID, squawk: '7500' }),
  'min-fuel': lone({ emergency: 'minfuel' }),
  lifeguard: lone({ emergency: 'lifeguard' }),
  ident: lone({ ident: true }),
  advisory: lone({ ra: ADVISORY }),
  'all-tags': lone(
    { emergency: 'lifeguard', ra: ADVISORY, ident: true },
    { ...LONE_ID, squawk: '7700' },
  ),
  'tags-cut': lone(
    { emergency: 'minfuel', ra: ADVISORY, ident: true },
    { ...LONE_ID, squawk: '7700' },
  ),
  'tags-and-heading': lone(
    { selHeading: 95, navModes: ['autopilot'] },
    { ...LONE_ID, squawk: '7700' },
  ),
  'hex-only': {
    ...lone({}, { hex: 'd20002', category: 'A1' }),
    reads: () => ({ ...LONE_LEVEL, gs: 0 }),
  },
  registration: lone({}, { hex: 'd20003', registration: 'TEST-03', category: 'A1' }),
  ground: lone({ alt: 'ground', gs: 12, track: 160 }),
  mlat: lone({ source: 'mlat' }),
  tisb: lone({ source: 'tisb' }),
  stale: { ...lone({}), lagSec: { position: 30 } },
};

/** The text a list row of `flight` opens with. */
export const listedAs = ({ id }: Flight): string =>
  id.flight ?? id.registration ?? id.hex.toUpperCase();

const AGES = Array.from({ length: HISTORY_SEC / STEP_SEC + 1 }, (_, i) => i * STEP_SEC);

/** Where a flight was at each of `AGES`, walked back from where it is now. */
function pathOf(flight: Flight): (readonly [number, number])[] {
  let [east, north] = flight.at;
  return AGES.map((age) => {
    const place = [east, north] as const;
    const { track = 0, gs = 0 } = flight.reads(age) ?? {};
    const nm = (gs * STEP_SEC) / SEC_PER_HOUR;
    east -= nm * Math.sin((track * Math.PI) / 180);
    north -= nm * Math.cos((track * Math.PI) / 180);
    return place;
  });
}

const UNTIMED = new Set(['type', 'registration', 'description', 'source', 'hex']);

/** The instant each reading of a report was heard: `at`, less its lag. */
function heardOf(flight: Flight, reading: Reading, at: number): AircraftReport['heard'] {
  const keys = [...Object.keys(reading).filter((key) => !UNTIMED.has(key)), 'position', 'messages'];
  const lags = new Map(Object.entries(flight.lagSec ?? {}));
  return Object.fromEntries(keys.map((key) => [key, at - (lags.get(key) ?? 0)]));
}

/** What `flight` reports at the step `step` of `AGES`, or nothing while it is not heard. */
function reportOf(
  flight: Flight,
  path: readonly (readonly [number, number])[],
  step: number,
  site: LatLon,
  nowSec: number,
): AircraftReport | null {
  const heardStep = Math.max(step, Math.ceil((flight.silentSec ?? 0) / STEP_SEC));
  const age = heardStep * STEP_SEC;
  const reading = flight.reads(age);
  const [east, north] = path[heardStep] ?? flight.at;
  if (!reading) return null;
  return {
    ...flight.id,
    ...reading,
    messages: (HISTORY_SEC - age) * MESSAGES_PER_SEC,
    position: latLonOf(site, [east, north]),
    heard: heardOf(flight, { ...flight.id, ...reading }, nowSec - age),
  };
}

/** The feed's events for a scope at `site` whose clock reads `clock`, history first. */
export function trafficEvents(fleet: readonly Flight[], site: LatLon, clock: Date): FeedEvent[] {
  const nowSec = clock.getTime() / 1000;
  const paths = fleet.map(pathOf);
  const snapshots = AGES.map((age, step): AircraftSnapshot => ({
    now: nowSec - age,
    messages: (HISTORY_SEC - age) * MESSAGES_PER_SEC * fleet.length,
    aircraft: fleet.flatMap((flight, i) => {
      const report = reportOf(flight, paths[i] ?? [], step, site, nowSec);
      return report ? [report] : [];
    }),
  }));
  const [latest, ...older] = snapshots;
  const snapshot = latest ? [latest] : [];
  return [
    { type: 'receiver', receiver: site },
    { type: 'backfill', snapshots: older.toReversed() },
    ...snapshot.map((s) => ({ type: 'snapshot' as const, snapshot: s, receivedAt: +clock })),
  ];
}

/**
 * A worker that gives each new block its flight's bearing and leaves it there. The placer proper
 * searches from a random seed for as long as a clock allows, so its bearings differ by the run.
 */
export function fixedPlacer(fleet: readonly Flight[]): string {
  const bearings = Object.fromEntries(fleet.map(({ id, bearing }) => [id.hex, bearing ?? NE]));
  return `self.addEventListener('message', ({ data: { scene } }) => {
    const bearings = ${JSON.stringify(bearings)};
    const dirs = new Map(scene.subjects.map((s) => [s.hex, s.dir ?? bearings[s.hex]]));
    self.postMessage({ dirs });
  });`;
}

/** A worker that posts `events` when started, as the feed worker would. */
export function replayWorker(events: readonly FeedEvent[]): string {
  return `self.addEventListener('message', () => {
    for (const event of ${JSON.stringify(events)}) self.postMessage(event);
  });`;
}
