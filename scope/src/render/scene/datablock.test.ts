import { describe, expect, it } from 'bun:test';

import { STANDARD_ALTIMETER } from '../../lib/altitude';
import type { Track } from '../../state/track';
import { blockOffset, DB_FONT_PX, DB_LINE, DB_WIDTH, NE } from '../layout/labels';
import { atlas } from './atlasFixture';
import {
  blockExtraLines,
  type BlockPlacement,
  dataBlock,
  drawDataBlock,
  extraLines,
  INTENT_TONE,
  type Run,
} from './datablock';
import { LineBatch, TextBatch } from './pack';
import { makeTrack as track } from './trackFixture';

const text = (runs: Run[]) => runs.map((r) => r.text).join('');
/** Two colors alike within the rounding of an 8-bit channel. */
const near = (x: number[], y: number[]) => x.every((v, k) => Math.abs(v - (y[k] ?? 0)) < 0.01);

describe('dataBlock', () => {
  it('shows callsign, then altitude with climb arrow and the type or GSW by phase', () => {
    // Arrange
    const t = track({ verticalRate: -1200 });
    const phaseA = 0;
    const phaseB = 8;

    // Act
    const [a, b] = [phaseA, phaseB].map((now) => dataBlock(t, now, STANDARD_ALTIMETER));

    // Assert
    expect(a?.prefix).toBeNull();
    expect(a?.line1).toBe('TEST01');
    expect([a, b].map((x) => text(x?.line2 ?? [])).toSorted()).toEqual(['110↓ 29M', '110↓ B789']);
  });

  it('falls back to the hex and the bracketed category when enrichment is missing', () => {
    // Arrange
    const t = track({
      flight: undefined,
      registration: undefined,
      type: undefined,
      category: 'A1',
      gs: undefined,
    });

    // Act
    const block = dataBlock(t, 0, STANDARD_ALTIMETER);

    // Assert
    expect(block.line1).toBe('D00001');
    expect(['110  [A1]', '110  ---']).toContain(text(block.line2));
  });

  it('adds the emergency prefix', () => {
    // Arrange
    const t = track({ squawk: '7600' });

    // Act
    const block = dataBlock(t, 0, STANDARD_ALTIMETER);

    // Assert
    expect(block.prefix).toBe('RF');
  });

  it('flips every block on the same clock, whatever the hex', () => {
    // Arrange
    const a = track({ hex: 'd00000' });
    const b = track({ hex: 'd000ff' });
    const now = 4;

    // Act
    const [ba, bb] = [dataBlock(a, now, STANDARD_ALTIMETER), dataBlock(b, now, STANDARD_ALTIMETER)];

    // Assert
    expect(ba.line2).toEqual(bb.line2);
  });

  it('follows the level and trend with the selected level as intent', () => {
    // Arrange
    const t = track({ verticalRate: 1500, selAlt: 16000 });

    // Act
    const block = dataBlock(t, 0, STANDARD_ALTIMETER);

    // Assert
    expect(block.line2).toEqual([
      { text: '110↑', intent: false },
      { text: '160', intent: true },
      { text: ' B789', intent: false },
    ]);
  });

  it('marks an aircraft holding its selected level with a check instead', () => {
    // Arrange
    const t = track({ alt: 34860, selAlt: 35000, navQnh: 1013.2 });

    // Act
    const block = dataBlock(t, 0, STANDARD_ALTIMETER);

    // Assert
    expect(block.line2).toEqual([
      { text: '349', intent: false },
      { text: '✓', intent: true },
      { text: ' B789', intent: false },
    ]);
  });

  it('puts the heading that steers the aircraft on a third line', () => {
    // Arrange
    const cases = [
      track({ selHeading: 95, navModes: ['autopilot'] }),
      track({ selHeading: 95, navModes: ['approach'] }),
      track(),
    ];

    // Act
    const out = cases.map((t) => dataBlock(t, 0, STANDARD_ALTIMETER).line3);

    // Assert
    expect(out).toEqual(['095°', null, null]);
  });

  it('prints the selected level as the crew set it, without the QNH correction', () => {
    // Arrange
    const t = track({ alt: 5000, selAlt: 5000 });
    const altimeter = { transitionAltFt: 14000, qnhInHg: 29.62 };

    // Act
    const block = dataBlock(t, 0, altimeter);

    // Assert
    expect(text(block.line2)).toBe('047 050 B789');
  });
});

describe('extraLines', () => {
  it('counts the emergency prefix and the heading line alike for a track and its block', () => {
    // Arrange
    const cases = [
      track(),
      track({ squawk: '7700' }),
      track({ selHeading: 95 }),
      track({ squawk: '7700', selHeading: 95 }),
    ];

    // Act
    const out = cases.map((t) => [
      blockExtraLines(dataBlock(t, 0, STANDARD_ALTIMETER)),
      extraLines(t),
    ]);

    // Assert
    expect(out).toEqual([
      [0, 0],
      [1, 1],
      [1, 1],
      [2, 2],
    ]);
  });
});

describe('drawDataBlock', () => {
  const ne: BlockPlacement = {
    at: { x: 0, y: 0 },
    ...blockOffset(NE, 0),
    color: '#ffffff',
    emphasised: false,
  };
  /** Each glyph's offset from the target and its color, in draw order. */
  const glyphs = (t: Track, place = ne) => {
    const batch = new TextBatch(atlas);
    drawDataBlock(new LineBatch(), batch, dataBlock(t, 0, STANDARD_ALTIMETER), place);
    const b = batch.finish();
    return Array.from({ length: b.count }, (_, i) => ({
      px: b.data[i * 16 + 2] ?? 0,
      py: b.data[i * 16 + 3] ?? 0,
      rgb: [10, 11, 12].map((k) => b.data[i * 16 + k] ?? 0),
    }));
  };

  it('puts the emergency prefix on a line of its own above the standard two', () => {
    // Arrange
    const plain = track();
    const emergency = track({ squawk: '7600' });

    // Act
    const [a, b] = [plain, emergency].map((t) => glyphs(t).map((g) => g.py));

    // Assert
    expect(b?.slice('RF'.length).map(Math.round)).toEqual(
      (a ?? []).map((py) => Math.round(py + DB_LINE)),
    );
    expect(b?.[0]).toBe(a?.[0] ?? -1);
  });

  it('sets the selected level and a third heading line in the dimmed intent tone', () => {
    // Arrange
    const t = track({ verticalRate: 1500, selAlt: 16000, selHeading: 95 });

    // Act
    const g = glyphs(t);

    // Assert
    const plain = g[0]?.rgb ?? [];
    const intent = plain.map((v) => v * INTENT_TONE);
    const tones = g.map(({ rgb }) => (near(rgb, plain) ? 'p' : near(rgb, intent) ? 'i' : '?'));
    // TEST01 / 110↑ 160 B789 / 095°, spaces drawing nothing
    expect(tones.join('')).toBe(['pppppp', 'pppp', 'iii', 'pppp', 'iiii'].join(''));
  });

  it('ends the text at the right edge of a block west of its target', () => {
    // Arrange
    const t = track();
    const w = { ...ne, ...blockOffset(4, 0) };
    const advance = (atlas.advance * DB_FONT_PX) / atlas.fontSize;

    // Act
    const g = glyphs(t, w);

    // Assert
    const line1 = g.slice(0, 'TEST01'.length).map((x) => x.px);
    const line2 = g.slice('TEST01'.length).map((x) => x.px);
    expect(Math.max(...line1)).toBeCloseTo(Math.max(...line2));
    expect(Math.max(...line1) + advance).toBeGreaterThan(w.dx + DB_WIDTH - 2);
    expect(Math.min(...line1)).toBeGreaterThan(w.dx + 2);
  });

  it('starts each line at the leader tip while a dragged block straddles the target', () => {
    // Arrange
    const t = track();
    const straddling = { ...ne, dx: -30, dy: -60 }; // the tip at the target's x, 30 px in
    const bufPx = (atlas.buffer * DB_FONT_PX) / atlas.fontSize;

    // Act
    const g = glyphs(t, straddling);

    // Assert
    const line1 = g.slice(0, 'TEST01'.length).map((x) => x.px);
    const line2 = g.slice('TEST01'.length).map((x) => x.px);
    expect(Math.min(...line1)).toBeCloseTo(-bufPx); // short enough to start at the tip
    expect(Math.min(...line2)).toBeLessThan(-bufPx); // pushed left to end within the block
  });

  it('keeps the runs of a right-aligned line contiguous', () => {
    // Arrange
    const t = track({ verticalRate: 1500, selAlt: 16000 });
    const w = { ...ne, ...blockOffset(4, 0) };
    const advance = (atlas.advance * DB_FONT_PX) / atlas.fontSize;

    // Act
    const g = glyphs(t, w);

    // Assert
    const line2 = g.slice('TEST01'.length).map((x) => x.px);
    const columns = line2.map((px) => Math.round((px - (line2[0] ?? 0)) / advance));
    expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11]); // 110↑160 B789
  });
});
