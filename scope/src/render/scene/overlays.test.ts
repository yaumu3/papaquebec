import { describe, expect, it } from 'bun:test';

import type { Vec2 } from '../../lib/geo';
import { type Batch, LINE_STRIDE, TEXT_STRIDE } from '../protocol';
import { atlas } from './atlasFixture';
import { buildOverlays, type OverlayInput } from './overlays';
import { parseColor } from './pack';
import { THEME } from './rules';

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
      dash: [d[o + 9] ?? 0, d[o + 10] ?? 0],
      color: Array.from(d.subarray(o + 11, o + 15)),
    };
  });
}

const free = (x: number, y: number) => ({ kind: 'free' as const, x, y });

describe('the RBL line', () => {
  it('is dotted, finished or pending', () => {
    // Arrange
    const cases = [
      overlays({ rbls: [rbl(131)] }),
      overlays({ rblPending: { a: free(130, 35) }, pointer: { cx: 500, cy: 300 } }),
    ];

    // Act
    const drawn = cases.map((input) => strokes(buildOverlays(input))[0]?.dash);

    // Assert
    expect(drawn).toEqual([
      [1, 3],
      [1, 3],
    ]);
  });
});

const color = (hex: string) => parseColor(hex).map(Math.fround);

/** What each stroke is: the RBL's dotted line, or solid. */
const kinds = (s: Stroke[]) => s.map((x) => (x.dash[0] === 0 ? 'solid' : 'line'));

/** The box the glyphs ink, CSS px from their anchor. */
const extent = (g: Glyph[]) => ({
  left: Math.min(...g.map((x) => x.left)),
  right: Math.max(...g.map((x) => x.right)),
  top: Math.min(...g.map((x) => x.top)),
  bottom: Math.max(...g.map((x) => x.bottom)),
});

/** A finished RBL due east, and the middle its readout sits on. */
const east = { input: () => overlays({ rbls: [rbl(131)] }), at: { x: 130.5, y: 35 } };
/** A pending RBL due east, its far end at the pointer. */
const pending = {
  input: () => overlays({ rblPending: { a: free(130, 35) }, pointer: { cx: 500, cy: 300 } }),
  at: { x: 131, y: 35 },
};

/** The strokes pinned at world `at` by both ends, as offsets from it in px. */
const pinnedAt = (s: Stroke[], at: Vec2) =>
  s.filter((x) => [x.a, x.b].every((p) => p.x === at.x && p.y === at.y)).map((x) => [x.pa, x.pb]);

describe('a pending RBL', () => {
  it('reads at the pointer as the range cursor does, with no arrow and no fade', () => {
    // Arrange
    const pointer = { cx: 500, cy: 300 };
    const cursor = buildOverlays(
      overlays({ rangeCursor: { kind: 'free', x: 130, y: 35 }, pointer }),
    );

    // Act
    const batches = buildOverlays(pending.input());

    // Assert
    const crosshair = [
      [
        { x: -8, y: 0 },
        { x: 8, y: 0 },
      ],
      [
        { x: 0, y: -8 },
        { x: 0, y: 8 },
      ],
    ];
    expect(kinds(strokes(batches))).toEqual(['line', 'solid', 'solid']);
    expect(pinnedAt(strokes(batches), pending.at)).toEqual(crosshair);
    expect(pinnedAt(strokes(cursor), pending.at)).toEqual(crosshair);
    const box = extent(inked(batches, pending.at));
    expect([box.left, box.top]).toEqual([expect.closeTo(12, 4), expect.closeTo(6, 4)]);
  });
});

describe('the RBL tag', () => {
  it('is the dim 10 px line heading the readout', () => {
    // Arrange
    const input = east.input();

    // Act
    const glyphs = inked(buildOverlays(input), east.at);

    // Assert
    const tag = glyphs.filter((g) => g.size === 10);
    expect(tag.map((g) => g.color)).toEqual([color(THEME.cursorDim)]);
    expect(Math.max(...tag.map((g) => g.bottom))).toBeLessThanOrEqual(
      Math.min(...glyphs.filter((g) => g.size === 11).map((g) => g.top)),
    );
  });

  it('leaves its ends unlabelled', () => {
    // Arrange
    const input = east.input();

    // Act
    const atAnchor = inked(buildOverlays(input), { x: 130, y: 35 });

    // Assert
    expect(atAnchor).toEqual([]);
  });
});
