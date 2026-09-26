import { describe, expect, it } from 'bun:test';

import type { Track } from '../../state/track';
import { type AtlasInfo, type Batch, Shape, type View } from '../protocol';
import { buildTargets, INTENT_TONE, type TargetInput } from './targets';
import { makeTrack } from './trackFixture';

const atlas: AtlasInfo = {
  width: 160,
  height: 40,
  cellW: 10,
  cellH: 20,
  columns: 16,
  fontSize: 40,
  buffer: 2,
  baseline: 16,
  advance: 6,
  chars:
    ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~↑↓°·',
};
const view: View = { centerX: 0, centerY: 0, pxPerNm: 10, widthPx: 800, heightPx: 600, dpr: 1 };

function track(over: Partial<Track> = {}): Track {
  return makeTrack({
    track: 90,
    history: [
      { lat: 0, lon: 0, x: 0, y: 2, t: 988, alt: 11000 },
      { lat: 0, lon: 0, x: 0.5, y: 2, t: 998, alt: 11000 },
      { lat: 0, lon: 0, x: 1, y: 2, t: 1008, alt: 11000 },
    ],
    ...over,
  });
}

function input(tracks: Track[], over: Partial<TargetInput> = {}): TargetInput {
  return {
    tracks,
    now: 1008,
    filter: { ground: true, lowerFl: 0, upperFl: 500, squawk: 'all' },
    vectorMin: 2,
    trailSec: 60,
    selected: null,
    hovered: null,
    view,
    atlas,
    labelDrag: null,
    altimeter: { transitionAltFt: 14000, qnhInHg: 29.92 },
    trace: null,
    ...over,
  };
}

const byKind = (batches: Batch[], kind: Batch['kind']) => batches.filter((b) => b.kind === kind);
const count = (batches: Batch[], kind: Batch['kind']) =>
  byKind(batches, kind).reduce((n, b) => n + b.count, 0);
/** Each text glyph's horizontal offset from its anchor and its color, in draw order. */
const glyphs = (batches: Batch[]) =>
  byKind(batches, 'text').flatMap((b) =>
    Array.from({ length: b.count }, (_, i) => ({
      px: b.data[i * 16 + 2] ?? 0,
      rgb: [10, 11, 12].map((k) => b.data[i * 16 + k] ?? 0),
    })),
  );
/** Two colors alike within the rounding of an 8-bit channel. */
const near = (x: number[], y: number[]) => x.every((v, k) => Math.abs(v - (y[k] ?? 0)) < 0.01);
const shapes = (batches: Batch[]) =>
  byKind(batches, 'markers').flatMap((b) =>
    Array.from({ length: b.count }, (_, i) => b.data[i * 12 + 5]),
  );

describe('buildTargets', () => {
  it('draws a glyph, a vector, a leader, trail slashes and two text lines for a live target', () => {
    // Arrange
    const t = track();

    // Act
    const { batches } = buildTargets(input([t]));

    // Assert
    expect(shapes(batches)).toEqual([Shape.Square]);
    expect(count(batches, 'lines')).toBe(2 + 1 + 1); // two trail slashes, vector, leader
    expect(count(batches, 'text')).toBe('ANA241'.length + '110B789'.length); // spaces emit nothing
  });

  it('reduces a filtered target to a bare hollow diamond', () => {
    // Arrange
    const t = track({ alt: 45000 });

    // Act
    const { batches } = buildTargets(
      input([t], { filter: { ground: true, lowerFl: 0, upperFl: 200, squawk: 'all' } }),
    );

    // Assert
    expect(shapes(batches)).toEqual([Shape.HollowDiamond]);
    expect(count(batches, 'text')).toBe(0);
    expect(count(batches, 'lines')).toBe(0);
  });

  it('renders a filtered target in full while it is selected', () => {
    // Arrange
    const t = track({ alt: 45000 });
    const band = { ground: true, lowerFl: 0, upperFl: 200, squawk: 'all' as const };

    // Act
    const { batches } = buildTargets(input([t], { filter: band, selected: '867a01' }));

    // Assert
    expect(shapes(batches).filter((s) => s !== Shape.Dot)).toEqual([Shape.Square]);
    expect(count(batches, 'text')).toBeGreaterThan(0);
  });

  it('omits the trail when the operator hid it and the vector when it is off', () => {
    // Arrange
    const t = track({ ops: { hideTrail: true, pinnedCorner: null, autoCorner: 'ne' } });

    // Act
    const { batches } = buildTargets(input([t], { vectorMin: 0 }));

    // Assert
    expect(count(batches, 'lines')).toBe(1); // leader only
  });

  it('skips targets without a drawable position', () => {
    // Arrange
    const t = track({ position: { kind: 'rr', lat: 1, lon: 2 } });

    // Act
    const { batches } = buildTargets(input([t]));

    // Assert
    expect(count(batches, 'markers')).toBe(0);
    expect(count(batches, 'text')).toBe(0);
  });

  it('draws a dragged block at the drag offset instead of a corner', () => {
    // Arrange
    const t = track();
    const drag = { hex: '867a01', dx: -40, dy: 30 };

    // Act
    const { batches } = buildTargets(input([t], { labelDrag: drag }));

    // Assert
    const text = byKind(batches, 'text')[0];
    const glyphOffsets = Array.from(
      { length: text?.count ?? 0 },
      (_, i) => text?.data[i * 16 + 2] ?? 0,
    );
    expect(Math.max(...glyphOffsets)).toBeLessThan(0); // whole block sits left of the target
  });

  it('draws every retained history fix as a dot for the selected target only', () => {
    // Arrange
    const t = track();
    const other = track({ hex: '867a02', flight: 'JAL317' });

    // Act
    const all = shapes(buildTargets(input([t, other], { selected: '867a01' })).batches);
    const none = shapes(buildTargets(input([t, other])).batches);

    // Assert
    expect(all.filter((s) => s === Shape.Dot)).toHaveLength(t.history.length);
    expect(none.filter((s) => s === Shape.Dot)).toHaveLength(0);
  });

  it('draws the full-day trace as dots as well when one is supplied', () => {
    // Arrange
    const t = track();
    const trace = [
      { lat: 0, lon: 0, x: -5, y: 2, t: 100, alt: 11000 },
      { lat: 0, lon: 0, x: -4, y: 2, t: 200, alt: 11000 },
    ];

    // Act
    const dots = shapes(buildTargets(input([t], { selected: '867a01', trace })).batches).filter(
      (s) => s === Shape.Dot,
    );

    // Assert
    expect(dots).toHaveLength(t.history.length + trace.length);
  });

  it('returns the corner chosen for each data block so the store can remember it', () => {
    // Arrange
    const t = track();

    // Act
    const { corners } = buildTargets(input([t]));

    // Assert
    expect(corners.get('867a01')).toBe('ne');
  });

  it('sets the selected level in the dimmed intent tone', () => {
    // Arrange
    const t = track({ baroRate: 1500, selAlt: 16000 });

    // Act
    const { batches } = buildTargets(input([t]));

    // Assert
    const g = glyphs(batches);
    const plain = g[0]?.rgb ?? [];
    const intent = plain.map((v) => v * INTENT_TONE);
    const tones = g.map(({ rgb }) => (near(rgb, plain) ? 'p' : near(rgb, intent) ? 'i' : '?'));
    // ANA241 / 110↑ 160 B789, spaces drawing nothing
    expect(tones.join('')).toBe(['pppppp', 'pppp', 'iii', 'pppp'].join(''));
  });

  it('keeps the runs of a right-aligned line contiguous', () => {
    // Arrange
    const t = track({
      baroRate: 1500,
      selAlt: 16000,
      ops: { hideTrail: false, pinnedCorner: 'nw', autoCorner: 'nw' },
    });
    const advance = (atlas.advance * 11) / atlas.fontSize;

    // Act
    const { batches } = buildTargets(input([t]));

    // Assert
    const line2 = glyphs(batches)
      .slice(6)
      .map((x) => x.px);
    const columns = line2.map((px) => Math.round((px - (line2[0] ?? 0)) / advance));
    expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11]); // 110↑160 B789
  });
});
