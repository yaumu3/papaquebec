import { describe, expect, it } from 'bun:test';

import type { Vec2 } from '../../lib/geo';
import { type Batch, TEXT_STRIDE } from '../protocol';
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

const segments = (batches: Batch[]) => batches.find((b) => b.kind === 'lines')?.count ?? 0;

describe('buildOverlays', () => {
  it('draws a short RBL as one segment and a long one along its geodesic', () => {
    // Arrange
    const cases = [rbl(130.05), rbl(150)];

    // Act
    const drawn = cases.map((r) => segments(buildOverlays(overlays({ rbls: [r] }))));

    // Assert
    expect(drawn[0]).toBe(1);
    expect(drawn[1]).toBeGreaterThan(1);
  });
});

/** A glyph anchored at world `at`: where it is inked relative to the anchor, CSS px, its size and color. */
interface Glyph {
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
    const top = (d[o + 3] ?? 0) + buf;
    out.push({
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
});
