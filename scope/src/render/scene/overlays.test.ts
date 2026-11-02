import { describe, expect, it } from 'bun:test';

import type { Vec2 } from '../../lib/geo';
import { type Batch, LINE_STRIDE, TEXT_STRIDE } from '../protocol';
import { atlas } from './atlasFixture';
import { buildOverlays, type OverlayInput } from './overlays';

/** Longitude and latitude as the scope plane, so long lines curve on it. */
const lonLat = {
  project: (lat: number, lon: number) => ({ x: lon, y: lat }),
  unproject: (x: number, y: number) => ({ lat: y, lon: x }),
};

function overlays(over: Partial<OverlayInput>): OverlayInput {
  return {
    tracks: new Map(),
    rbls: [],
    rblPending: null,
    rangeCursor: null,
    pointer: null,
    declination: () => 0,
    ...lonLat,
    view: { centerX: 130, centerY: 35, pxPerNm: 100, widthPx: 800, heightPx: 600, dpr: 1 },
    atlas,
    snap: () => null,
    ...over,
  };
}

/** An RBL along latitude 35° from longitude 130° to `x`. */
const rbl = (x: number) => ({
  a: { kind: 'free' as const, x: 130, y: 35 },
  b: { kind: 'free' as const, x, y: 35 },
  tag: 'A',
});

/** A segment of the lines batch: its world ends, its offsets from them in px, dash and color. */
interface Stroke {
  a: Vec2;
  b: Vec2;
  pa: Vec2;
  pb: Vec2;
  dash: [number, number];
  color: number[];
}

function strokes(batches: Batch[]): Stroke[] {
  const lines = batches.find((b) => b.kind === 'lines');
  if (!lines) return [];
  const d = lines.data;
  return Array.from({ length: lines.count }, (_, i) => {
    const o = i * LINE_STRIDE;
    const at = (k: number) => ({ x: d[o + k] ?? 0, y: d[o + k + 1] ?? 0 });
    return {
      a: at(0),
      pa: at(2),
      b: at(4),
      pb: at(6),
      dash: [d[o + 10] ?? 0, d[o + 11] ?? 0],
      color: Array.from(d.subarray(o + 14, o + 18)),
    };
  });
}

/** How far north of 35° the dotted line bows, in degrees. */
const bow = (s: Stroke[]) =>
  Math.max(...s.filter((x) => x.dash[0] > 0).flatMap((x) => [x.a.y, x.b.y].map((y) => y - 35)));

describe('buildOverlays', () => {
  it('draws a short RBL straight and a long one along its geodesic', () => {
    // Arrange
    const cases = [rbl(131), rbl(150)];

    // Act
    const drawn = cases.map((r) => strokes(buildOverlays(overlays({ rbls: [r] }))));

    // Assert
    expect(bow(drawn[0] ?? [])).toBeLessThan(1e-3);
    expect(bow(drawn[1] ?? [])).toBeGreaterThan(0.1);
  });
});

/** A glyph anchored at world `at`: which it is, where it is inked relative to the anchor, CSS px, its size and color. */
interface Glyph {
  char: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  size: number;
  color: number[];
}

function inked(batches: Batch[], at: Vec2): Glyph[] {
  const text = batches.find((b) => b.kind === 'text');
  if (!text) return [];
  const out: Glyph[] = [];
  for (let i = 0; i < text.count; i++) {
    const o = i * TEXT_STRIDE;
    const d = text.data;
    if (d[o] !== at.x || d[o + 1] !== at.y) continue;
    const scale = (d[o + 4] ?? 0) / atlas.cellW;
    const buf = atlas.buffer * scale;
    const left = (d[o + 2] ?? 0) + buf;
    const col = Math.round(((d[o + 6] ?? 0) * atlas.width) / atlas.cellW);
    const row = Math.round(((d[o + 7] ?? 0) * atlas.height) / atlas.cellH);
    const top = (d[o + 3] ?? 0) + buf;
    out.push({
      char: atlas.chars.charAt(row * atlas.columns + col),
      left,
      right: left + atlas.advance * scale,
      top,
      bottom: top + (atlas.cellH - 2 * atlas.buffer) * scale,
      size: scale * atlas.fontSize,
      color: Array.from(d.subarray(o + 10, o + 14)),
    });
  }
  return out;
}

describe('the range cursor readout', () => {
  it('reads the distance as a bare figure, as an RBL does', () => {
    // Arrange: a degree of longitude east along 35° N, 49.1 NM
    const input = overlays({
      rangeCursor: { kind: 'free', x: 130, y: 35 },
      pointer: { cx: 500, cy: 300 },
    });

    // Act
    const glyphs = inked(buildOverlays(input), { x: 131, y: 35 });

    // Assert
    const top = Math.min(...glyphs.map((g) => g.top));
    expect(glyphs.filter((g) => g.top === top).length).toBe('49.1'.length);
  });

  it('names a free origin by its latitude and longitude', () => {
    // Arrange
    const input = overlays({
      rangeCursor: { kind: 'free', x: 130.25, y: 35.5 },
      pointer: { cx: 500, cy: 300 },
    });

    // Act
    const glyphs = inked(buildOverlays(input), { x: 131, y: 35 });

    // Assert: a space draws no glyph
    const bottom = Math.max(...glyphs.map((g) => g.top));
    const name = glyphs.filter((g) => g.top === bottom).map((g) => g.char);
    expect(name.join('')).toBe('35.50000130.25000');
  });
});
