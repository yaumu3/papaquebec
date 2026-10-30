/**
 * The chart as the lists the renderer draws today. Temporary: PR 2 replaces the renderer and
 * removes this adapter. One part gives one entry, in item order. Holds, altimeter setting
 * regions, areas drawn as a line and the holes of an area have no place in the old lists.
 */
import type { Chart, ItemPart } from './chart';
import type { DrawnLayers, LatLon } from './mapdata';
import { type Layer, ROUTE_LAYERS, SECTOR_LAYERS } from './mapsetFormat';

/** Special-use airspace is dashed. */
const DASHED_KINDS = new Set(['R', 'D', 'P', 'TRA', 'TSA', 'ALERT', 'WARNING']);

const NOT_DRAWN = new Set<Layer>(['hold', 'asr']);
const ROUTES = new Set<Layer>(ROUTE_LAYERS);

const latLon = ([lon, lat]: readonly [number, number]): LatLon => [lat, lon];

/** A published limit in feet: SFC and GND are 0, UNL has none, FLnnn is nnn hundreds. */
function limitFt(limit: string | undefined): number | undefined {
  if (limit === undefined || limit === 'UNL') return undefined;
  if (limit === 'SFC' || limit === 'GND') return 0;
  const level = /^FL(\d+)$/.exec(limit);
  return level ? Number(level[1]) * 100 : parseInt(limit, 10);
}

function addPoint(out: DrawnLayers, layer: Layer, { geometry: g, properties: p }: ItemPart) {
  if (g.type !== 'Point' || !('id' in p)) return;
  const [lat, lon] = latLon(g.coordinates);
  if (layer === 'ad') out.airports.push({ id: p.id, name: p.name ?? p.id, lat, lon });
  else if (layer === 'navaid') {
    out.navaids.push({ id: p.id, ...(p.kind ? { kind: p.kind } : {}), lat, lon });
  } else out.waypoints.push({ id: p.id, lat, lon });
}

function addArea(out: DrawnLayers, layer: Layer, { geometry: g, properties: p }: ItemPart) {
  const name = 'name' in p ? p.name : undefined;
  const ring = g.type === 'Polygon' ? g.coordinates[0] : undefined;
  if (!name || !ring) return;
  const points = ring.map(latLon);
  if (SECTOR_LAYERS.has(layer)) {
    out.sectors.push({ name, points });
    return;
  }
  const kind = ('kind' in p && p.kind) || layer.toUpperCase();
  const lowerFt = 'lower' in p ? limitFt(p.lower) : undefined;
  const upperFt = 'upper' in p ? limitFt(p.upper) : undefined;
  out.airspace.push({
    name,
    kind,
    points,
    dashed: DASHED_KINDS.has(kind),
    ...(lowerFt === undefined ? {} : { lowerFt }),
    ...(upperFt === undefined ? {} : { upperFt }),
  });
}

function addPart(out: DrawnLayers, layer: Layer, part: ItemPart) {
  if (NOT_DRAWN.has(layer)) return;
  const { geometry: g, properties: p } = part;
  if ('id' in p) addPoint(out, layer, part);
  else if (ROUTES.has(layer) && g.type === 'LineString') {
    const name = 'name' in p ? p.name : undefined;
    if (name) out.airways.push({ name, points: g.coordinates.map(latLon) });
  } else addArea(out, layer, part);
}

export function drawnOf(chart: Chart): DrawnLayers {
  const out: DrawnLayers = {
    waypoints: [],
    navaids: [],
    airways: [],
    airspace: [],
    sectors: [],
    airports: [],
  };
  for (const item of chart) {
    for (const part of item.parts) addPart(out, item.layer, part);
  }
  return out;
}
