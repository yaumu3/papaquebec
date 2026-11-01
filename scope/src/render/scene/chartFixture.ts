import { type ChartItem, type ItemPart } from '../../lib/chart';
import type { StyledLayer } from '../../lib/layers';
import { isPointLayer } from '../../lib/mapsetFormat';
import { type Batch, LINE_STRIDE, TEXT_STRIDE } from '../protocol';
import { atlas } from './atlasFixture';
import { parseColor } from './pack';

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

/** What a test may add to a part: a kind, a name, or for an area a lower limit. */
export interface Extra {
  kind?: string;
  name?: string;
  lower?: string;
}

/** The properties each group of layers carries; `extra` adds a kind, a name or a lower limit. */
export function partOf(layer: StyledLayer, geometry: Geometry, extra: Extra = {}): ItemPart {
  const properties = isPointLayer(layer)
    ? { layer, id: 'Q', ...extra }
    : { layer, name: 'Q', ...extra };
  return { geometry, properties };
}

export const itemOf = (layer: StyledLayer, ...parts: ItemPart[]): ChartItem => ({
  key: layer,
  layer,
  parts,
});

export const keyed = (key: string, item: ChartItem): ChartItem => ({ ...item, key });

export interface Instance {
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

/** The instances of a lines batch, as they were packed. */
export function instances(batch: Batch): Instance[] {
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
      color: Array.from(d.subarray(o + 10, o + 14)),
      angle: d[o + 14] ?? 0,
      halo: d[o + 15] ?? 0,
    };
  });
}
