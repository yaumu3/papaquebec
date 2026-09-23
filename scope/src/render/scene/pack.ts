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
  /** [on, off] in CSS px; omitted for solid. */
  dash?: [number, number];
}

/**
 * Layout per instance (16 floats):
 * `ax ay apx apy bx by bpx bpy width dashOn dashOff r g b a _`
 */
export class LineBatch {
  private readonly buf: InstanceBuffer;

  constructor(capacity = 256) {
    this.buf = new InstanceBuffer(LINE_STRIDE, capacity);
  }

  segment(a: Anchor, b: Anchor, color: string, style: LineStyle = {}): void {
    const at = this.buf.next();
    const d = this.buf.buffer;
    const [r, g, bl, al] = parseColor(color);
    d[at] = a.x;
    d[at + 1] = a.y;
    d[at + 2] = a.px ?? 0;
    d[at + 3] = a.py ?? 0;
    d[at + 4] = b.x;
    d[at + 5] = b.y;
    d[at + 6] = b.px ?? 0;
    d[at + 7] = b.py ?? 0;
    d[at + 8] = style.width ?? 1;
    d[at + 9] = style.dash?.[0] ?? 0;
    d[at + 10] = style.dash?.[1] ?? 0;
    d[at + 11] = r;
    d[at + 12] = g;
    d[at + 13] = bl;
    d[at + 14] = al;
  }

  polyline(points: readonly Anchor[], color: string, style: LineStyle = {}): void {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (a && b) this.segment(a, b, color, style);
    }
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
}

/**
 * Layout per instance (16 floats):
 * `wx wy px py w h u0 v0 u1 v1 r g b a _ _`
 * The quad covers a whole atlas cell; `px py` is its top-left offset from the anchor.
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
      pen += atlas.advance * scale;
    }
  }

  finish(): Batch {
    return this.buf.finish('text');
  }
}
