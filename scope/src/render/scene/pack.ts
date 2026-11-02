import { DEFAULT_LINE_WIDTH, type DashPattern } from '../../lib/layers';
import { chordOf } from '../../lib/polyline';
import {
  type AtlasInfo,
  type Batch,
  LINE_STRIDE,
  MARKER_STRIDE,
  Shape,
  TEXT_STRIDE,
} from '../protocol';

/** A point on the world plane (NM) with an optional CSS-pixel offset. */
export interface Anchor {
  x: number;
  y: number;
  px?: number;
  py?: number;
}

export type Rgba = [number, number, number, number];

const colorCache = new Map<string, Rgba>();

/** `#rrggbb` or `#rrggbbaa` to unit floats. */
export function parseColor(hex: string): Rgba {
  const cached = colorCache.get(hex);
  if (cached) return cached;
  const n = Number.parseInt(hex.slice(1), 16);
  const rgba: Rgba =
    hex.length === 9
      ? [
          ((n >>> 24) & 255) / 255,
          ((n >>> 16) & 255) / 255,
          ((n >>> 8) & 255) / 255,
          (n & 255) / 255,
        ]
      : [((n >>> 16) & 255) / 255, ((n >>> 8) & 255) / 255, (n & 255) / 255, 1];
  colorCache.set(hex, rgba);
  return rgba;
}

/** Writes `values` from `at`: for a few values `TypedArray.set` is much the slower. */
function writeAll(into: Float32Array, at: number, values: readonly number[]): void {
  values.forEach((value, i) => {
    into[at + i] = value;
  });
}

/** Growable Float32Array of fixed-stride instances. */
class InstanceBuffer {
  private data: Float32Array;
  private used = 0;

  constructor(
    private readonly stride: number,
    capacity: number,
  ) {
    this.data = new Float32Array(stride * Math.max(1, capacity));
  }

  /** Reserves one instance and returns its start offset. */
  next(): number {
    if (this.used + this.stride > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const at = this.used;
    this.used += this.stride;
    return at;
  }

  get buffer(): Float32Array {
    return this.data;
  }

  finish(kind: Batch['kind']): Batch {
    return { kind, data: this.data.slice(0, this.used), count: this.used / this.stride };
  }
}

export interface LineStyle {
  /** CSS px. */
  width?: number;
  dash?: DashPattern;
}

/**
 * Where a polyline sits in a span of a route, which the line shader cuts back at its stops: the
 * world distance from the span's first stop to the polyline's start, the span's length, and the
 * cut at each end in CSS px (0 where the span does not end at a stop).
 */
export interface SpanPlace {
  back: number;
  length: number;
  cutBack: number;
  cutAhead: number;
}

/**
 * Layout per instance (22 floats):
 * `ax ay apx apy bx by bpx bpy width along p0 p1 p2 p3 r g b a back ahead cutBack cutAhead`
 * `along` is the world distance from the polyline's start to `a`; the dash pattern `p0..p3`
 * runs on from it, so it does not restart at a vertex. `back` is the world distance from the
 * span's first stop to `a` and `ahead` from `b` to its last; the cuts are in CSS px. A line
 * outside a span writes 0 in all four.
 */
export class LineBatch {
  private readonly buf: InstanceBuffer;

  constructor(capacity = 256) {
    this.buf = new InstanceBuffer(LINE_STRIDE, capacity);
  }

  segment(
    a: Anchor,
    b: Anchor,
    color: string,
    style: LineStyle = {},
    along = 0,
    span: readonly number[] = [],
  ): void {
    const at = this.buf.next();
    const d = this.buf.buffer;
    d[at] = a.x;
    d[at + 1] = a.y;
    d[at + 2] = a.px ?? 0;
    d[at + 3] = a.py ?? 0;
    d[at + 4] = b.x;
    d[at + 5] = b.y;
    d[at + 6] = b.px ?? 0;
    d[at + 7] = b.py ?? 0;
    d[at + 8] = style.width ?? DEFAULT_LINE_WIDTH;
    d[at + 9] = along;
    writeAll(d, at + 10, style.dash ?? []);
    writeAll(d, at + 14, parseColor(color));
    writeAll(d, at + 18, span);
  }

  polyline(
    points: readonly Anchor[],
    color: string,
    style: LineStyle = {},
    place?: SpanPlace,
  ): void {
    let along = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (!a || !b) continue;
      along += this.link(a, b, color, style, along, place);
    }
  }

  /** `polyline` along x then y in `points`, from the x at `from` to the x at `to`. */
  stretch(
    points: ArrayLike<number>,
    from: number,
    to: number,
    color: string,
    style: LineStyle = {},
    place?: SpanPlace,
  ): void {
    const a = { x: 0, y: 0 };
    const b = { x: points[from] ?? 0, y: points[from + 1] ?? 0 };
    let along = 0;
    for (let i = from + 2; i <= to; i += 2) {
      a.x = b.x;
      a.y = b.y;
      b.x = points[i] ?? 0;
      b.y = points[i + 1] ?? 0;
      along += this.link(a, b, color, style, along, place);
    }
  }

  /** A polyline's segment `along` from its start, placed in its span; gives the segment's length. */
  private link(
    a: Anchor,
    b: Anchor,
    color: string,
    style: LineStyle,
    along: number,
    place?: SpanPlace,
  ): number {
    const chord = chordOf(a, b);
    const span = place && [
      place.back + along,
      place.length - place.back - along - chord,
      place.cutBack,
      place.cutAhead,
    ];
    this.segment(a, b, color, style, along, span);
    return chord;
  }

  finish(): Batch {
    return this.buf.finish('lines');
  }
}

/**
 * Layout per instance (12 floats):
 * `wx wy px py size shape r g b a _ _`
 */
export class MarkerBatch {
  private readonly buf: InstanceBuffer;

  constructor(capacity = 64) {
    this.buf = new InstanceBuffer(MARKER_STRIDE, capacity);
  }

  marker(at: Anchor, shape: Shape, sizePx: number, color: string): void {
    const o = this.buf.next();
    const d = this.buf.buffer;
    const [r, g, b, a] = parseColor(color);
    d[o] = at.x;
    d[o + 1] = at.y;
    d[o + 2] = at.px ?? 0;
    d[o + 3] = at.py ?? 0;
    d[o + 4] = sizePx;
    d[o + 5] = shape;
    d[o + 6] = r;
    d[o + 7] = g;
    d[o + 8] = b;
    d[o + 9] = a;
  }

  finish(): Batch {
    return this.buf.finish('markers');
  }
}

export interface TextStyle {
  align?: 'left' | 'right' | 'center';
  baseline?: 'top' | 'middle' | 'bottom';
  /** Radians clockwise on the screen, about the anchor. */
  angle?: number;
  /** Rims each glyph in the scope's background colour. */
  halo?: boolean;
}

/** How far a halo reaches outside a glyph's edge, CSS px. */
const HALO_PX = 1;

/**
 * Layout per instance (16 floats):
 * `wx wy px py w h u0 v0 u1 v1 r g b a angle halo`
 * The quad covers a whole atlas cell; `px py` is its top-left offset from the anchor, turned by
 * `angle` about it. `halo` is how far the halo reaches outside the glyph's edge, as a drop in the
 * atlas field's value; 0 draws none.
 */
export class TextBatch {
  private readonly buf: InstanceBuffer;
  private readonly index = new Map<string, number>();

  constructor(
    private readonly atlas: AtlasInfo,
    capacity = 256,
  ) {
    this.buf = new InstanceBuffer(TEXT_STRIDE, capacity);
    Array.from(atlas.chars).forEach((c, i) => this.index.set(c, i));
  }

  /** Width of a run in CSS px at `sizePx`; every code point takes one cell, known or not. */
  measure(s: string, sizePx: number): number {
    return (Array.from(s).length * this.atlas.advance * sizePx) / this.atlas.fontSize;
  }

  /** The cell drawn for a glyph the atlas lacks, so the gap is visible rather than closed. */
  private placeholder(): number {
    return this.index.get('·') ?? this.index.get('?') ?? 0;
  }

  /** Line height in CSS px at `sizePx`: the atlas cell less its buffer. */
  lineHeight(sizePx: number): number {
    return ((this.atlas.cellH - 2 * this.atlas.buffer) * sizePx) / this.atlas.fontSize;
  }

  text(s: string, at: Anchor, sizePx: number, color: string, style: TextStyle = {}): void {
    const { atlas } = this;
    const scale = sizePx / atlas.fontSize;
    const width = this.measure(s, sizePx);
    const lineH = this.lineHeight(sizePx);
    let pen =
      (at.px ?? 0) - (style.align === 'right' ? width : style.align === 'center' ? width / 2 : 0);
    const top =
      (at.py ?? 0) -
      (style.baseline === 'bottom' ? lineH : style.baseline === 'middle' ? lineH / 2 : 0);
    const [r, g, b, a] = parseColor(color);
    const cellW = atlas.cellW * scale;
    const cellH = atlas.cellH * scale;
    const bufPx = atlas.buffer * scale;
    const halo = style.halo ? (HALO_PX * atlas.fontSize) / (sizePx * atlas.buffer) : 0;
    for (const c of s) {
      const i = this.index.get(c) ?? this.placeholder();
      if (c === ' ') {
        pen += atlas.advance * scale;
        continue;
      }
      const col = i % atlas.columns;
      const row = Math.floor(i / atlas.columns);
      const o = this.buf.next();
      const d = this.buf.buffer;
      d[o] = at.x;
      d[o + 1] = at.y;
      d[o + 2] = pen - bufPx;
      d[o + 3] = top - bufPx;
      d[o + 4] = cellW;
      d[o + 5] = cellH;
      d[o + 6] = (col * atlas.cellW) / atlas.width;
      d[o + 7] = (row * atlas.cellH) / atlas.height;
      d[o + 8] = ((col + 1) * atlas.cellW) / atlas.width;
      d[o + 9] = ((row + 1) * atlas.cellH) / atlas.height;
      d[o + 10] = r;
      d[o + 11] = g;
      d[o + 12] = b;
      d[o + 13] = a;
      d[o + 14] = style.angle ?? 0;
      d[o + 15] = halo;
      pen += atlas.advance * scale;
    }
  }

  finish(): Batch {
    return this.buf.finish('text');
  }
}
