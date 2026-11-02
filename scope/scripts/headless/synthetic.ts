/**
 * A synthetic map set shaped like JCAB's national data, which is not committed: seeded, centred on
 * a site, and as large as the AIP at scale 1. Scale N multiplies the items and spreads them over
 * an area √N wide. It follows the converter rules: a line two items share has one set of vertices.
 * All names are invented.
 */
import { type GeoPoint, type Vec2 } from '../../src/lib/geo';
import { direct, inverse } from '../../src/lib/geodesic';
import type { LonLat } from '../../src/lib/mapdata';
import type { MapSetData, MapSetFeature } from '../../src/lib/mapset';
import { type AreaLayer, MAPSET_VERSION, type RouteLayer } from '../../src/lib/mapsetFormat';

export interface SyntheticOptions {
  site: GeoPoint;
  /** The factor on the items at national scale; 1 by default. */
  scale?: number;
  /** The seed of the layout; 1 by default. */
  seed?: number;
}

export interface SyntheticSet {
  data: MapSetData;
  /** The ids of the fixes each route goes through, in order, by its name. */
  routeFixes: ReadonlyMap<string, readonly string[]>;
}

const LOW_SECTORS = 30;
const HIGH_SECTORS = 15;
/** The high sectors drawn over one low sector exactly; the rest span two. */
const SAME_FOOTPRINT = 5;
const GRID_COLUMNS = 6;
const CELL_WIDE_NM = 200;
const CELL_TALL_NM = 180;
const TMAS = 15;
const AERODROMES = 40;
const RESTRICTED = 20;
const FIXES = 1300;
const NAVAIDS = 150;
const AIRWAYS = 300;
const PROCEDURES = 100;
const HOLDS = 100;
const NAVAID_KINDS = ['VOR', 'DME', 'VOR/DME', 'TACAN', 'VORTAC', 'NDB'] as const;
/** One navaid in this many has no kind. */
const KINDLESS_EVERY = 25;
/** One airway in this many begins along the one before it, the other kind, on the same vertices. */
const SHARES_EVERY = 4;
const SHARED_HOPS = 2;
/** One airway in this many is one-way. */
const ONE_WAY_EVERY = 3;
/** Pieces of a route segment between two fixes, as JCAB writes them. */
const SEGMENT_PIECES = 20;
/** How far apart an airway's fixes are and how many it has beyond the fewest. */
const AIRWAY_HOPS = { fewest: 5, more: 4, minNm: 45, maxNm: 100 };
const PROCEDURE_HOPS = { fewest: 3, more: 1, minNm: 15, maxNm: 60 };
/** The sharpest turn a route makes at a fix, in radians. */
const MAX_TURN = Math.PI / 3;

/** Pieces of a sector line, about a nautical mile each, as JCAB densifies its boundaries. */
const GRID_PIECES = 215;
/** Pieces of a full circle, written at a fine step as JCAB's are. */
const CIRCLE_PIECES = 360;
const SPOKE_PIECES = 40;
const SIDE_PIECES = 60;
const CORNERS = 5;
/** One approach control area in this many is stepped, in as many parts as there are steps. */
const STEPPED_EVERY = 3;
const STEPS = ['SFC', '1500FT', '3000FT'] as const;
/** The share of the area, each way, that aerodromes and restrictions are placed in. */
const INSIDE = 0.9;

const PER_DEGREE = 1e6;

const rounded = (degrees: number) => Math.round(degrees * PER_DEGREE) / PER_DEGREE;

const TAU = 2 * Math.PI;

const lonLatOf = ({ lat, lon }: GeoPoint): LonLat => [rounded(lon), rounded(lat)];

const geoOf = ([lon, lat]: LonLat): GeoPoint => ({ lat, lon });

/** A seeded generator of numbers in [0, 1): mulberry32. */
function randomOf(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A base-26 name of at least `width` letters, one for each number. */
function letters(n: number, width: number): string {
  const head = n >= 26 || width > 1 ? letters(Math.floor(n / 26), width - 1) : '';
  return head + String.fromCharCode(65 + (n % 26));
}

/** A frequency to write on an area, by its number; areas may share one. */
const frequency = (n: number) => `${120 + (n % 16)}.${String((n * 5) % 100).padStart(2, '0')}`;

/** A place routes go through. */
interface Waypoint {
  id: string;
  place: Vec2;
  at: LonLat;
}

/** What every builder here works from. */
interface Drawing {
  random: () => number;
  /** How many of `base` items this set holds. */
  count: (base: number) => number;
  /** The position `x` NM east and `y` NM north of the site. */
  at: (place: Vec2) => LonLat;
  /** How far from the site the area reaches, east and north. */
  reach: Vec2;
  /** A random place inside the area. */
  anywhere: () => Vec2;
}

function along(a: LonLat, b: LonLat, pieces: number): LonLat[] {
  const from = geoOf(a);
  const { distanceNm, bearingTrue } = inverse(from, geoOf(b));
  const inner = Array.from({ length: pieces - 1 }, (_, i) =>
    lonLatOf(direct(from, bearingTrue, (distanceNm * (i + 1)) / pieces)),
  );
  return [a, ...inner, b];
}

/** The geodesic from `a` to `b`, measured one way whichever is asked for, so vertices are shared. */
const line = (a: LonLat, b: LonLat, pieces: number): LonLat[] =>
  String(a) < String(b) ? along(a, b, pieces) : along(b, a, pieces).toReversed();

/** Lines joined end to end, each starting where the last one ended. */
const joined = (lines: readonly LonLat[][]): LonLat[] =>
  lines.flatMap((part, i) => (i === 0 ? part : part.slice(1)));

/** The geodesics through `corners` in turn. */
const through = (corners: readonly LonLat[], pieces: number): LonLat[] =>
  joined(corners.slice(1).map((to, i) => line(corners[i] ?? to, to, pieces)));

type AreaProperties = Extract<MapSetFeature['properties'], { layer: AreaLayer }>;

type RouteProperties = Extract<MapSetFeature['properties'], { layer: RouteLayer }>;
type HoldProperties = Extract<MapSetFeature['properties'], { layer: 'hold' }>;
type StationProperties = Exclude<
  MapSetFeature['properties'],
  AreaProperties | RouteProperties | HoldProperties
>;

const stationAt = (properties: StationProperties, coordinates: LonLat): MapSetFeature => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates },
});

const holdAt = (properties: HoldProperties, coordinates: LonLat): MapSetFeature => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates },
});

const area = (properties: AreaProperties, ring: LonLat[]): MapSetFeature => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Polygon', coordinates: [ring] },
});

/** The arc `radiusNm` round `center`, clockwise from `fromDeg` over `degrees` in `pieces`. */
const arc = (center: LonLat, radiusNm: number, fromDeg: number, degrees: number, pieces: number) =>
  Array.from({ length: pieces + 1 }, (_, i) =>
    lonLatOf(direct(geoOf(center), (fromDeg + (degrees * i) / pieces) % 360, radiusNm)),
  );

const circle = (center: LonLat, radiusNm: number) => {
  const ring = arc(center, radiusNm, 0, 360, CIRCLE_PIECES);
  return [...ring.slice(0, -1), ring[0] ?? center];
};

/** The cells of the sector grid, corner by corner: its lines fall where no cell's edge is straight. */
function sectorCorners(columns: number, rows: number, { at, random }: Drawing): LonLat[][] {
  const jitter = (cell: number) => (random() - 0.5) * (cell / 4);
  return Array.from({ length: rows + 1 }, (_row, r) =>
    Array.from({ length: columns + 1 }, (_cell, c) =>
      at({
        x: (c - columns / 2) * CELL_WIDE_NM + jitter(CELL_WIDE_NM),
        y: (rows / 2 - r) * CELL_TALL_NM + jitter(CELL_TALL_NM),
      }),
    ),
  );
}

/** The grid's sectors and the FIR round them, every common line on the same vertices. */
function sectors(drawing: Drawing): MapSetFeature[] {
  const { count } = drawing;
  const lows = count(LOW_SECTORS);
  const columns = Math.round(GRID_COLUMNS * Math.sqrt(lows / LOW_SECTORS));
  const rows = Math.ceil(lows / columns);
  const grid = sectorCorners(columns, rows, drawing);
  const corner = (r: number, c: number) => grid[r]?.[c] ?? [0, 0];
  /** The ring round `tall` rows and `wide` columns of cells, from the cell at `r`, `c`. */
  const block = (r: number, c: number, tall: number, wide: number) => {
    const cols = Array.from({ length: wide + 1 }, (_, i) => c + i);
    const down = Array.from({ length: tall + 1 }, (_, i) => r + i);
    return through(
      [
        ...cols.map((at) => corner(r, at)),
        ...down.slice(1).map((at) => corner(at, c + wide)),
        ...cols
          .toReversed()
          .slice(1)
          .map((at) => corner(r + tall, at)),
        ...down
          .toReversed()
          .slice(1)
          .map((at) => corner(at, c)),
      ],
      GRID_PIECES,
    );
  };
  const sector = (name: number, ring: LonLat[], limits: Partial<AreaProperties>) =>
    area(
      {
        layer: 'sector',
        name: `Z${name}`,
        callsign: 'QUEBEC CONTROL',
        freqs: [frequency(name)],
        ...limits,
      },
      ring,
    );
  const low = Array.from({ length: lows }, (_, i) =>
    sector(100 + i, block(Math.floor(i / columns), i % columns, 1, 1), { upper: 'FL335' }),
  );
  const high = { lower: 'FL335', upper: 'UNL' };
  const sameFootprint = count(SAME_FOOTPRINT);
  const overSame = Array.from({ length: sameFootprint }, (_, i) =>
    sector(5000 + i, block(i % rows, (i * 2) % columns, 1, 1), high),
  );
  const pairsInRow = Math.floor(columns / 2);
  const overTwo = Array.from({ length: count(HIGH_SECTORS) - sameFootprint }, (_, i) =>
    sector(6000 + i, block(Math.floor(i / pairsInRow) % rows, (i % pairsInRow) * 2, 1, 2), high),
  );
  const fir = area({ layer: 'fir', name: 'QUEBEC FIR' }, block(0, 0, rows, columns));
  return [fir, ...low, ...overSame, ...overTwo];
}

/** A stepped area's parts: wedges of a circle round `center`, the spokes between them shared. */
function wedges(center: LonLat, radiusNm: number, parts: number): LonLat[][] {
  const degrees = 360 / parts;
  return Array.from({ length: parts }, (_, i) => {
    const edge = arc(center, radiusNm, i * degrees, degrees, CIRCLE_PIECES / parts);
    const [first = center] = edge;
    const last = edge.at(-1) ?? center;
    return joined([line(center, first, SPOKE_PIECES), edge, line(last, center, SPOKE_PIECES)]);
  });
}

/** An approach control area round an aerodrome: a circle, or stepped in several parts. */
function approachArea(name: string, center: LonLat, stepped: boolean, drawing: Drawing) {
  const radiusNm = 30 + drawing.random() * 20;
  const upper = 'FL145';
  if (!stepped)
    return [area({ layer: 'tma', name, lower: 'SFC', upper }, circle(center, radiusNm))];
  return wedges(center, radiusNm, STEPS.length).map((ring, i) =>
    area({ layer: 'tma', name, lower: STEPS[i] ?? 'SFC', upper }, ring),
  );
}

/** Where the aerodromes are. */
const aerodromeSites = ({ anywhere, at, count }: Drawing): Waypoint[] =>
  Array.from({ length: count(AERODROMES) }, (_, i) => {
    const place = anywhere();
    return { id: `X${letters(i, 3)}`, place, at: at(place) };
  });

/** The aerodromes, each with a CTR, and the approach control areas of the first few. */
function aerodromes(sites: readonly Waypoint[], drawing: Drawing): MapSetFeature[] {
  const { count, random } = drawing;
  const tmas = count(TMAS);
  return sites.flatMap(({ id, at }, i) => {
    const ctr = area(
      {
        layer: 'ctr',
        name: `${id} CTR`,
        callsign: `${id} TOWER`,
        freqs: [frequency(i)],
        lower: 'SFC',
        upper: '3000FT',
      },
      circle(at, 5 + random() * 4),
    );
    const approach =
      i < tmas ? approachArea(`${id} TMA`, at, i % STEPPED_EVERY === 0, drawing) : [];
    return [stationAt({ layer: 'ad', id, name: `${id} INTL` }, at), ctr, ...approach];
  });
}

/** The outline of a restriction: a circle, or a polygon of a few densified sides. */
function restrictedOutline(index: number, drawing: Drawing): LonLat[] {
  const { anywhere, at, random } = drawing;
  const center = at(anywhere());
  if (index % 3 === 0) return circle(center, 5 + random() * 10);
  const corners = Array.from({ length: CORNERS }, (_, i) =>
    lonLatOf(direct(geoOf(center), ((i + random() * 0.8) * 360) / CORNERS, 12 + random() * 13)),
  );
  return through([...corners, corners[0] ?? center], SIDE_PIECES);
}

/** The restricted, danger and training areas. */
function restrictions(drawing: Drawing): MapSetFeature[] {
  const each = drawing.count(RESTRICTED);
  const numbered = (make: (n: number, ring: LonLat[]) => MapSetFeature) =>
    Array.from({ length: each }, (_, i) => make(i, restrictedOutline(i, drawing)));
  return [
    ...numbered((n, ring) =>
      area(
        {
          layer: 'pr',
          name: `XQ R-${900 + n}`,
          kind: n % 6 === 0 ? 'P' : 'R',
          lower: 'SFC',
          upper: 'FL200',
        },
        ring,
      ),
    ),
    ...numbered((n, ring) =>
      area({ layer: 'dng', name: `D-${900 + n}`, kind: 'D', lower: 'SFC', upper: '5000FT' }, ring),
    ),
    ...numbered((n, ring) =>
      area(
        { layer: 'tra', name: `W-${900 + n}`, kind: 'MIL', lower: 'FL100', upper: 'FL250' },
        ring,
      ),
    ),
  ];
}

/** `n` places over the area, none crowding another: a random pick of the cells of a lattice. */
function scattered(n: number, { random, reach }: Drawing): Vec2[] {
  const side = Math.sqrt((4 * reach.x * reach.y) / n);
  const columns = Math.ceil((2 * reach.x) / side);
  const rows = Math.ceil((2 * reach.y) / side);
  const cells = Array.from({ length: columns * rows }, (_, i) => ({
    order: random(),
    place: {
      x: ((i % columns) + random()) * ((2 * reach.x) / columns) - reach.x,
      y: (Math.floor(i / columns) + random()) * ((2 * reach.y) / rows) - reach.y,
    },
  }));
  return cells
    .toSorted((a, b) => a.order - b.order)
    .slice(0, n)
    .map((cell) => cell.place);
}

const named = (places: readonly Vec2[], idOf: (i: number) => string, { at }: Drawing): Waypoint[] =>
  places.map((place, i) => ({ id: idOf(i), place, at: at(place) }));

/** The way from `a` to `b`, in radians clockwise from north. */
const courseTo = (a: Vec2, b: Vec2) => Math.atan2(b.x - a.x, b.y - a.y);

const turnBetween = (a: number, b: number) => Math.abs(((a - b + 3 * Math.PI) % TAU) - Math.PI);

interface Hops {
  fewest: number;
  more: number;
  minNm: number;
  maxNm: number;
}

/** The next waypoint on from `from`, not far off `course` and not among `gone`, if there is one. */
function onward(
  from: Vec2,
  course: number,
  { minNm, maxNm }: Hops,
  among: readonly Waypoint[],
  gone: readonly Waypoint[],
  random: () => number,
): Waypoint | undefined {
  const within = among.filter(({ place }) => {
    const nm = Math.hypot(place.x - from.x, place.y - from.y);
    return nm >= minNm && nm <= maxNm && turnBetween(courseTo(from, place), course) <= MAX_TURN;
  });
  const fresh = within.filter((w) => !gone.includes(w));
  return fresh[Math.floor(random() * fresh.length)];
}

/** `path` carried on through waypoints of `among`, until it has `hops` or runs out of them. */
function walked(
  path: readonly Waypoint[],
  course: number,
  hops: Hops,
  among: readonly Waypoint[],
  { random }: Drawing,
): Waypoint[] {
  const wanted = hops.fewest + Math.floor(random() * (hops.more + 1));
  const out = [...path];
  let heading = course;
  while (out.length <= wanted) {
    const last = out.at(-1);
    const next = last && onward(last.place, heading, hops, among, out, random);
    if (!last || !next) break;
    heading = courseTo(last.place, next.place);
    out.push(next);
  }
  return out;
}

/** A course from `place` that crosses the area rather than leaving it. */
const inward = (place: Vec2, random: () => number) =>
  courseTo(place, { x: 0, y: 0 }) + (random() - 0.5) * 2 * MAX_TURN;

const WALKS = 4;

/** The longest of a few walks through `among`, from `from` or else from anywhere among them. */
function route(
  among: readonly Waypoint[],
  hops: Hops,
  drawing: Drawing,
  from?: Waypoint,
): Waypoint[] {
  const { random } = drawing;
  const walks = Array.from({ length: WALKS }, () => {
    const start = from ?? among[Math.floor(random() * among.length)];
    return start ? walked([start], inward(start.place, random), hops, among, drawing) : [];
  });
  const longest = walks.reduce((best, path) => (path.length > best.length ? path : best), []);
  if (longest.length < 2) throw new Error('a route found nowhere to go');
  return longest;
}

/** The middle stretch of `path`, carried on along its own course. */
function sharing(path: readonly Waypoint[], among: readonly Waypoint[], drawing: Drawing) {
  const from = Math.floor((path.length - SHARED_HOPS - 1) / 2);
  const stretch = path.slice(from, from + SHARED_HOPS + 1);
  const [before, last] = stretch.slice(-2);
  if (!before || !last) return route(among, AIRWAY_HOPS, drawing);
  return walked(stretch, courseTo(before.place, last.place), AIRWAY_HOPS, among, drawing);
}

const lineOf = (path: readonly Waypoint[]) =>
  through(
    path.map((w) => w.at),
    SEGMENT_PIECES,
  );

/** A route Feature through `path`, whose fixes are noted under its name. */
function routeFeature(
  properties: RouteProperties,
  path: readonly Waypoint[],
  drawing: Drawing,
  fixes: Map<string, readonly string[]>,
): MapSetFeature {
  fixes.set(
    properties.name,
    path.map((w) => w.id),
  );
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'LineString', coordinates: lineOf(path) },
  };
}

/** The airways: CONV and RNAV by turns, each `SHARES_EVERY`th along the one before. */
function airways(
  among: readonly Waypoint[],
  drawing: Drawing,
  fixes: Map<string, readonly string[]>,
): MapSetFeature[] {
  const paths: Waypoint[][] = [];
  return Array.from({ length: drawing.count(AIRWAYS) }, (_, i) => {
    const earlier = i % SHARES_EVERY === SHARES_EVERY - 1 ? paths.at(-1) : undefined;
    const path = earlier ? sharing(earlier, among, drawing) : route(among, AIRWAY_HOPS, drawing);
    paths.push(path);
    const number = 900 + i;
    const oneWay = i % ONE_WAY_EVERY === 0 ? { oneWay: true } : {};
    return routeFeature(
      i % 2 === 0
        ? { layer: 'conv', name: `V${number}`, ...oneWay }
        : { layer: 'rnav', name: `Y${number}`, ...oneWay },
      path,
      drawing,
      fixes,
    );
  });
}

const PROCEDURE_LAYERS = ['sid', 'star', 'trans'] as const;

/** A departure out of an aerodrome, an arrival into one, or a transition between fixes. */
function procedures(
  ports: readonly Waypoint[],
  among: readonly Waypoint[],
  drawing: Drawing,
  fixes: Map<string, readonly string[]>,
): MapSetFeature[] {
  return Array.from({ length: drawing.count(PROCEDURES) }, (_, i) => {
    const layer = PROCEDURE_LAYERS[i % PROCEDURE_LAYERS.length] ?? 'sid';
    const port = ports[i % ports.length];
    const start = layer === 'trans' || !port ? among[i % among.length] : port;
    if (!start) throw new Error('no waypoints');
    const out = route(among, PROCEDURE_HOPS, drawing, start);
    const path = layer === 'star' ? out.toReversed() : out;
    const name = `${out.at(-1)?.id}${i + 1}${layer === 'trans' ? `.${start.id}` : ''}`;
    return routeFeature({ layer, name, oneWay: true }, path, drawing, fixes);
  });
}

/** A hold at every so many fixes: RNAV or conventional, its inbound course magnetic or true. */
function holds(fixes: readonly Waypoint[], { count }: Drawing): MapSetFeature[] {
  const wanted = count(HOLDS);
  return Array.from({ length: wanted }, (_, i) => {
    const fix = fixes[Math.floor((i * fixes.length) / wanted)];
    if (!fix) throw new Error('no fixes');
    const course = (i * 37) % 360;
    return holdAt(
      {
        layer: 'hold',
        turn: i % 4 === 0 ? 'L' : 'R',
        ...(i % 2 === 0 ? { kind: 'RNAV' } : {}),
        ...(i % 5 === 0 ? { inboundTrue: course } : { inboundMag: course }),
      },
      fix.at,
    );
  });
}

const navaidKind = (i: number) =>
  i % KINDLESS_EVERY === KINDLESS_EVERY - 1 ? {} : { kind: NAVAID_KINDS[i % NAVAID_KINDS.length] };

/** The set around `site`; the same options give the same bytes. */
export function syntheticMapSet({ site, scale = 1, seed = 1 }: SyntheticOptions): SyntheticSet {
  const random = randomOf(seed);
  const wide = Math.sqrt(scale) * INSIDE;
  const reach = {
    x: (GRID_COLUMNS * CELL_WIDE_NM * wide) / 2,
    y: ((LOW_SECTORS / GRID_COLUMNS) * CELL_TALL_NM * wide) / 2,
  };
  const drawing: Drawing = {
    random,
    count: (base) => Math.round(base * scale),
    at: ({ x, y }) => lonLatOf(direct(site, (Math.atan2(x, y) * 180) / Math.PI, Math.hypot(x, y))),
    reach,
    anywhere: () => ({ x: (random() * 2 - 1) * reach.x, y: (random() * 2 - 1) * reach.y }),
  };
  const ports = aerodromeSites(drawing);
  const fixes = named(
    scattered(drawing.count(FIXES), drawing),
    (i) => `Q${letters(i, 4)}`,
    drawing,
  );
  const navaids = named(
    scattered(drawing.count(NAVAIDS), drawing),
    (i) => `Q${letters(i, 2)}`,
    drawing,
  );
  const waypoints = [...navaids, ...fixes];
  const routeFixes = new Map<string, readonly string[]>();
  return {
    data: {
      type: 'FeatureCollection',
      version: MAPSET_VERSION,
      id: 'synthetic-national',
      title: `Synthetic national set, N = ${scale}`,
      effective: '2026-10-29',
      note: 'Generated for the benchmarks: invented names, not for navigation.',
      features: [
        ...sectors(drawing),
        ...aerodromes(ports, drawing),
        ...restrictions(drawing),
        ...navaids.map(({ id, at }, i) => stationAt({ layer: 'navaid', id, ...navaidKind(i) }, at)),
        ...fixes.map(({ id, at }) => stationAt({ layer: 'fix', id }, at)),
        ...airways(waypoints, drawing, routeFixes),
        ...procedures(ports, waypoints, drawing, routeFixes),
        ...holds(fixes, drawing),
      ],
    },
    routeFixes,
  };
}
