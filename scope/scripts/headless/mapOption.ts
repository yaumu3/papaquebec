/** What the load test's `--map`, `--layers` and `--density` ask for, read before a page opens. */
import { readFileSync } from 'node:fs';

import { chartOf } from '../../src/lib/chart';
import type { GeoPoint } from '../../src/lib/geo';
import { DRAW_STACK, type LabelDensity } from '../../src/lib/layers';
import { type MapSetData, validateMapSet } from '../../src/lib/mapset';
import { BUILTIN_ID } from '../../src/lib/mapsetFormat';
import { topologyOf } from '../../src/lib/topology';
import type { Chart } from './browser';
import { syntheticMapSet } from './synthetic';

export type MapOption =
  | { from: 'none' }
  | { from: 'example' }
  | { from: 'synthetic'; scale: number }
  | { from: 'file'; path: string };

export function parseMapOption(text: string): MapOption {
  if (text === 'none' || text === 'example') return { from: text };
  if (text === 'synthetic') return { from: 'synthetic', scale: 1 };
  const [word, written] = text.split('=');
  if (word !== 'synthetic') return { from: 'file', path: text };
  const scale = Number(written);
  if (!written || !(scale > 0)) throw new Error(`not a scale: ${text}`);
  return { from: 'synthetic', scale };
}

const EXAMPLE = 'schema/example.mapset.geojson';

/** How large a map set is, as the chart and topology count it. */
export interface MapSize {
  items: number;
  areaEdges: number;
  routeEdges: number;
  points: number;
}

export interface LoadedMap {
  chart: Chart;
  data: MapSetData;
  size: MapSize;
}

function sizeOf(data: MapSetData): MapSize {
  const { chart, areas, routes, points } = topologyOf(chartOf([data]));
  return {
    items: chart.length,
    areaEdges: areas.edgeCount,
    routeEdges: routes.edgeCount,
    points: points.length,
  };
}

/** A file on disk, which must pass the strict parse as its import will. */
function mapFromFile(path: string): LoadedMap {
  const valid = validateMapSet(JSON.parse(readFileSync(path, 'utf8')));
  if (!valid.ok) throw new Error(`${path}: ${valid.message}`);
  const { data } = valid;
  return { chart: { title: data.title, file: path }, data, size: sizeOf(data) };
}

function syntheticMap(site: GeoPoint, scale: number): LoadedMap {
  const { data } = syntheticMapSet({ site, scale });
  const file = {
    name: 'synthetic.mapset.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify(data)),
  };
  return { chart: { title: data.title, file }, data, size: sizeOf(data) };
}

/** The map a run imports, sized on this side rather than read from the page. */
export function loadMap(option: MapOption, site: GeoPoint): LoadedMap | null {
  if (option.from === 'none') return null;
  if (option.from === 'synthetic') return syntheticMap(site, option.scale);
  return mapFromFile(option.from === 'file' ? option.path : EXAMPLE);
}

export type LayerChoice = 'default' | 'all';

interface SettingsChoice {
  map: boolean;
  layers: LayerChoice;
  density: LabelDensity;
}

/**
 * The settings a run starts from; none at all with no map and the defaults. With a map the
 * built-in set is off, so what draws is what was sized.
 */
export function benchSettings({ map, layers, density }: SettingsChoice) {
  const every = layers === 'all';
  if (!map && !every && density === 'normal') return undefined;
  return {
    labelDensity: density,
    ...(map ? { disabledSets: [BUILTIN_ID] } : {}),
    ...(every ? { shownLayers: Object.fromEntries(DRAW_STACK.map((l) => [l, true])) } : {}),
  };
}
