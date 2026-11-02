import { type Chart, type ChartItem, type ItemPart } from '../../lib/chart';
import type { ShownMemory } from '../../lib/fits';
import { DRAW_STACK, type LabelDensity, LAYER_TABLE } from '../../lib/layers';
import {
  isChartLayer,
  isPointLayer,
  type Layer,
  type PointLayer,
  POINT_LAYERS,
} from '../../lib/mapsetFormat';
import { pathLines } from '../../lib/pathLines';
import { type AreaPlace, areaPlaceOf } from '../../lib/pole';
import { pathSpans, type SpansOf, uncutSpans } from '../../lib/routeSpans';
import { stopCuts } from '../../lib/stops';
import { drawnPointsOf, topologyOf } from '../../lib/topology';
import { type LayerState, drawnItemsOf } from '../../lib/visibility';
import { shownExcept } from '../../lib/visibilityFixture';
import type { Declination } from '../../lib/wmm';
import { type Batch, LINE_STRIDE, MARKER_STRIDE, TEXT_STRIDE } from '../protocol';
import type { Slots } from '../slots';
import { atlas } from './atlasFixture';
import { type BuiltLabels, buildShapes, CHART_SLICES, sliceOf } from './chart';
import { buildHighlight } from './highlight';
import { parseColor } from './pack';
import { buildTraces } from './traces';

/** The scope plane for tests: x is the longitude and y the latitude. */
export const project = (lat: number, lon: number) => ({ x: lon, y: lat });

export type Geometry = ItemPart['geometry'];
export type Position = [number, number];

export const line = (...at: Position[]): Geometry => ({ type: 'LineString', coordinates: at });
export const polygon = (...rings: Position[][]): Geometry => ({
  type: 'Polygon',
  coordinates: rings,
});
export const point = (at: Position): Geometry => ({ type: 'Point', coordinates: at });
/** A closed triangle, so its ring has three edges. */
export const triangle = (x: number): Position[] => [
  [x, 0],
  [x + 0.01, 0],
  [x + 0.01, 0.01],
  [x, 0],
];
/** A closed square ring from the corner (`from`, `from`) to (`to`, `to`). */
export const box = (from: number, to: number): Position[] => [
  [from, from],
  [to, from],
  [to, to],
  [from, to],
  [from, from],
];

/** A Feature of a map set document, as a file holds it. */
export const feat = (properties: object, geometry: object) => ({
  type: 'Feature',
  properties,
  geometry,
});

/** What a test may add to a part: a kind, a name, the limits and frequencies of an area or the one-way flag of a route. */
export interface Extra {
  kind?: string;
  name?: string;
  lower?: string;
  upper?: string;
  oneWay?: boolean;
  freqs?: string[];
  id?: string;
  inboundMag?: number;
  inboundTrue?: number;
  turn?: 'L' | 'R';
}

/** The properties each group of layers carries; `extra` adds a kind, a name, a limit, frequencies or the flag. */
export function partOf(layer: Layer, geometry: Geometry, extra: Extra = {}): ItemPart {
  const properties =
    layer === 'hold'
      ? {
          layer,
          turn: 'R' as const,
          ...('inboundMag' in extra ? {} : { inboundTrue: 0 }),
          ...extra,
        }
      : isPointLayer(layer)
        ? { layer, id: 'Q', ...extra }
        : { layer, name: 'Q', ...extra };
  return { geometry, properties };
}

export const itemOf = (layer: Layer, ...parts: ItemPart[]): ChartItem => ({
  key: layer,
  layer,
  parts,
});

export const keyed = (key: string, item: ChartItem): ChartItem => ({ ...item, key });

/** A one-part item named `name`, on the layer `layer`, through these points. */
export const airway = (layer: Layer, name: string, ...at: Position[]) =>
  keyed(name, itemOf(layer, partOf(layer, line(...at), { name })));

/** A one-way route: `airway` with the flag. */
export const oneWay = (layer: Layer, name: string, ...at: Position[]) =>
  keyed(name, itemOf(layer, partOf(layer, line(...at), { name, oneWay: true })));

/** A one-part item of a layer's own geometry, keyed by `key`, which is the layer by default. */
export const single = (layer: Layer, geometry: Geometry, extra: Extra = {}, key: string = layer) =>
  keyed(key, itemOf(layer, partOf(layer, geometry, extra)));

/** A point item of `layer` at `at`, keyed `key`. */
export const stopAt = (layer: PointLayer, at: Position, key: string = layer) =>
  keyed(key, itemOf(layer, partOf(layer, point(at))));

/** A sector part limited from `lower` to `upper`, as far as they are given. */
export const sectorPart = (lower?: string, upper?: string): ItemPart =>
  partOf('sector', polygon(), {
    name: 'X',
    ...(lower ? { lower } : {}),
    ...(upper ? { upper } : {}),
  });

/** A chart of one item for each part, keyed by position. */
export const chartWith = (...parts: ItemPart[]): Chart =>
  parts.map((part, i) => ({ key: String(i), layer: part.properties.layer, parts: [part] }));

/** A GeoJSON Feature of a layer, as a map set holds it. */
export const featureOf = (layer: Layer, geometry: Geometry, extra: Extra = {}) => ({
  type: 'Feature' as const,
  ...partOf(layer, geometry, extra),
});

/** A map set document of these Features. */
export const setOf = (id: string, ...features: ReturnType<typeof featureOf>[]) => ({
  type: 'FeatureCollection' as const,
  version: 2,
  id,
  title: id,
  features,
});

export interface Segment {
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** The CSS px offsets of the two ends from their world points. */
  offsetA: { x: number; y: number };
  offsetB: { x: number; y: number };
  width: number;
  along: number;
  pattern: number[];
  color: number[];
  /** The distance back to the span's first stop and ahead to its last, and the two cuts. */
  span: number[];
}

/** The segments of a lines batch, as they were packed. */
export function segments(batch: Batch): Segment[] {
  const d = batch.data;
  return Array.from({ length: batch.count }, (_, i) => {
    const o = i * LINE_STRIDE;
    const at = (k: number) => ({ x: d[o + k] ?? 0, y: d[o + k + 1] ?? 0 });
    return {
      a: at(0),
      b: at(4),
      offsetA: at(2),
      offsetB: at(6),
      width: d[o + 8] ?? 0,
      along: d[o + 9] ?? 0,
      pattern: Array.from(d.subarray(o + 10, o + 14)),
      color: Array.from(d.subarray(o + 14, o + 18)),
      span: Array.from(d.subarray(o + 18, o + 22)),
    };
  });
}

/** The ends of each segment of a lines batch as short strings: `x,y>x,y`. */
export const edges = (batch: Batch): string[] =>
  segments(batch).map(({ a, b }) => `${a.x},${a.y}>${b.x},${b.y}`);

/** The markers of a markers batch, as they were packed. */
export function markers({ data, count }: Batch) {
  return Array.from({ length: count }, (_, i) => {
    const o = i * MARKER_STRIDE;
    return {
      at: { x: data[o] ?? 0, y: data[o + 1] ?? 0 },
      size: data[o + 4] ?? 0,
      shape: data[o + 5] ?? 0,
      color: Array.from(data.subarray(o + 6, o + 10)),
    };
  });
}

/** The unit floats a hex colour packs to. */
export const packed = (hex: string) => parseColor(hex).map((c) => Math.fround(c));

/** The glyph instances of a text batch, as they were packed. */
export function glyphs(batch: Batch) {
  const d = batch.data;
  return Array.from({ length: batch.count }, (_, i) => {
    const o = i * TEXT_STRIDE;
    const column = Math.round(((d[o + 6] ?? 0) * atlas.width) / atlas.cellW);
    const row = Math.round(((d[o + 7] ?? 0) * atlas.height) / atlas.cellH);
    return {
      char: Array.from(atlas.chars)[row * atlas.columns + column] ?? '',
      at: { x: d[o] ?? 0, y: d[o + 1] ?? 0 },
      px: d[o + 2] ?? 0,
      py: d[o + 3] ?? 0,
      h: d[o + 5] ?? 0,
      color: Array.from(d.subarray(o + 10, o + 14)),
      angle: d[o + 14] ?? 0,
      halo: d[o + 15] ?? 0,
    };
  });
}

/** What a text batch says, glyph after glyph. */
export const spelled = (batch: Batch): string =>
  glyphs(batch)
    .map((g) => g.char)
    .join('');

/** The text runs of a batch: the glyphs that share an anchor, read in order. */
export function textRuns(batch: Batch) {
  const runs: { text: string; at: { x: number; y: number }; glyphs: ReturnType<typeof glyphs> }[] =
    [];
  for (const glyph of glyphs(batch)) {
    const last = runs.at(-1);
    if (last && last.at.x === glyph.at.x && last.at.y === glyph.at.y) {
      last.text += glyph.char;
      last.glyphs.push(glyph);
    } else runs.push({ text: glyph.char, at: glyph.at, glyphs: [glyph] });
  }
  return runs;
}

/** The CSS px a run of `chars` characters takes at `size` px in the fixture's atlas. */
export const labelWidth = (chars: number, size = 9) =>
  (chars * atlas.advance * size) / atlas.fontSize;

/** Rows without their colour, in one order whatever order they were drawn in. */
export const withoutColor = (rows: readonly object[]): string[] =>
  rows.map((row) => JSON.stringify({ ...row, color: undefined })).toSorted();

/** What a scene reads that a test varies. */
export interface SceneOptions {
  /** The chart layers that draw; all of them by default. */
  layers?: readonly Layer[];
  /** The state of each layer; every layer shown but the items in `hidden` by default. */
  stateOf?: (layer: Layer) => LayerState;
  /** The keys of the items that are not drawn. */
  hidden?: readonly string[];
  /** Whether the navaids are within their range. */
  inRange?: boolean;
  density?: LabelDensity;
  /** The settled scale, px per unit of the plane. */
  scale?: number;
  project?: (lat: number, lon: number) => { x: number; y: number };
  declinationAt?: () => Declination;
  placeOf?: (item: ChartItem) => AreaPlace | undefined;
  /** What the labels showed before, kept between scenes that share it. */
  shown?: ShownMemory;
  /** Called each time the scene reads the points that draw. */
  onPointsRead?: () => void;
}

const CHART_LAYERS = DRAW_STACK.filter(isChartLayer);
type Slice = (typeof CHART_SLICES)[number];

/** One batch of many: their instances in order. */
function joined(kind: Batch['kind'], batches: readonly Batch[]): Batch {
  const data = new Float32Array(batches.reduce((n, b) => n + b.data.length, 0));
  let at = 0;
  for (const batch of batches) {
    data.set(batch.data, at);
    at += batch.data.length;
  }
  return { kind, data, count: batches.reduce((n, b) => n + b.count, 0) };
}

/** The batch at `index` of a build, which must be there. */
function batchAt(built: readonly Batch[], index: number, what: string): Batch {
  const batch = built[index];
  if (!batch) throw new Error(`${what} built no batch ${index}`);
  return batch;
}

/**
 * The scene of a chart as the scope builds it: what draws, the points that stand, and each
 * slice's shapes and labels. Everything a test reads of a build goes through here.
 */
export function sceneOf(chart: Chart, options: SceneOptions = {}) {
  const {
    layers = CHART_LAYERS,
    hidden = [],
    stateOf = () => shownExcept(...hidden),
    inRange = true,
    density = 'dense',
    scale = 1000,
    project: plane = project,
    declinationAt = () => () => 0,
    placeOf = (item: ChartItem) => areaPlaceOf(item, plane),
    shown = new Map() as ShownMemory,
    onPointsRead = () => {},
  } = options;
  const topology = topologyOf(chart);
  const drawn = drawnItemsOf(chart, layers, stateOf, () => inRange);
  const drawnIn = (among: readonly Layer[]) => drawn.filter((i) => among.includes(i.layer));
  const drawnPoints = () => {
    onPointsRead();
    return drawnPointsOf(topology, drawnIn(POINT_LAYERS));
  };
  const routeLines = pathLines(topology.routes, plane);
  const areaSpans = uncutSpans(pathLines(topology.areas, plane));
  const spansMade: { spansOf?: SpansOf } = {};
  const routeSpans: SpansOf = (path) => {
    spansMade.spansOf ??= pathSpans(
      stopCuts(drawnPoints(), (layer) => LAYER_TABLE[layer].style.size),
      routeLines,
    );
    return spansMade.spansOf(path);
  };
  const inputOf = (slice: Slice, narrowed: readonly Layer[] = layers) => {
    const among = slice.layers.filter((l) => layers.includes(l) && narrowed.includes(l));
    return {
      topology,
      drawnPoints,
      project: plane,
      areaSpans,
      routeSpans,
      layers: among,
      drawnItems: drawnIn(among),
    };
  };
  const labelsMade = new Map<Slice, BuiltLabels>();
  const labelsOf = (slice: Slice): BuiltLabels => {
    const known = labelsMade.get(slice);
    if (known) return known;
    const made = slice.buildLabels({
      ...inputOf(slice),
      labelDensity: density,
      atlas,
      settledScale: () => scale,
      placeOf,
      shown,
    });
    labelsMade.set(slice, made);
    return made;
  };
  const labelled = (labels: Slice['labels']) => {
    const slice = CHART_SLICES.find((s) => s.labels === labels);
    if (!slice) throw new Error(`no slice has ${labels}`);
    return slice;
  };
  const shapesOf = (slice: Slice, narrowed?: readonly Layer[]) => {
    const [lines, marks] =
      buildShapes(slice, inputOf(slice, narrowed), declinationAt)[slice.shapes] ?? [];
    if (!lines || !marks) throw new Error('a slice built no shapes');
    return { lines, markers: marks };
  };

  const litBatches = (item: ChartItem) =>
    buildHighlight(item, {
      spanLabels: labelsOf(labelled('routeLabels')).spanLabels ?? new Map(),
      areaNames: labelsOf(sliceOf(item.layer)).areaNames ?? new Map(),
      topology,
      routeSpans,
      settledScale: () => scale,
      shown,
      project: plane,
      atlas,
      placeOf,
    });

  /** What lights an item: its label, and the symbols and idents of the points lit. */
  const highlight = (item: ChartItem) => {
    const { label, points } = litBatches(item);
    const [gaps, text, strokes] = label;
    const [symbolStrokes, symbolMarkers, idents] = points;
    return {
      gaps,
      text,
      strokes,
      points: { strokes: symbolStrokes, markers: symbolMarkers, idents },
    };
  };

  return {
    /** The lines and markers of the chart, back to front; of `narrowed` layers alone when given. */
    shapes(narrowed?: readonly Layer[]) {
      const built = CHART_SLICES.map((slice) => shapesOf(slice, narrowed));
      return {
        lines: joined(
          'lines',
          built.map((b) => b.lines),
        ),
        markers: joined(
          'markers',
          built.map((b) => b.markers),
        ),
      };
    },
    /** The idents of the points. */
    pointLabels() {
      const built = labelsOf(labelled('pointLabels')).batches;
      return { text: batchAt(built, 0, 'the point labels') };
    },
    /** The route labels: the gaps cut in the lines, the text, the chevrons. */
    routeLabels() {
      const built = labelsOf(labelled('routeLabels')).batches;
      const at = (index: number) => batchAt(built, index, 'the route labels');
      return { gaps: at(0), text: at(1), chevrons: at(2) };
    },
    /** The area labels: the text and the rules of the fractions. */
    areaLabels() {
      const built = labelsOf(labelled('areaLabels')).batches;
      return {
        text: batchAt(built, 0, 'the area labels'),
        rules: batchAt(built, 1, 'the area labels'),
      };
    },
    highlight,
    /** What the tree's pointing and the search add over the chart. */
    traces({
      pointedAt,
      searched,
    }: {
      pointedAt: ChartItem | null;
      searched: readonly ChartItem[];
    }) {
      const { traces = [], tracedPoints = [] } = buildTraces({
        pointedAt,
        searched,
        highlight: pointedAt ? litBatches(pointedAt) : null,
        project: plane,
        declinationAt,
      });
      return {
        searched: {
          lines: batchAt(traces, 0, 'the traces'),
          strokes: batchAt(tracedPoints, 0, 'the traces'),
          markers: batchAt(tracedPoints, 1, 'the traces'),
        },
        pointed: {
          lines: batchAt(traces, 1, 'the traces'),
          strokes: batchAt(tracedPoints, 2, 'the traces'),
          markers: batchAt(tracedPoints, 3, 'the traces'),
        },
        /** The highlight a route or an area has among the traces, under the chart's points. */
        litTraces: traces.slice(2),
        /** The highlight a point has among the traced points, over the chart's own. */
        litPoints: tracedPoints.slice(4),
      };
    },
    /** Every slot of the chart, as the scope files them. */
    slots(): Slots {
      const slots: Slots = {};
      for (const slice of CHART_SLICES) {
        const shapes = shapesOf(slice);
        slots[slice.shapes] = [shapes.lines, shapes.markers];
        slots[slice.labels] = labelsOf(slice).batches;
      }
      return slots;
    },
  };
}
