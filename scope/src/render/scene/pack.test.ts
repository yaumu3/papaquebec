import { describe, expect, it } from 'bun:test';

import { LINE_STRIDE, MARKER_STRIDE, Shape, TEXT_STRIDE } from '../protocol';
import { LineBatch, MarkerBatch, parseColor, TextBatch } from './pack';

describe('parseColor', () => {
  it('turns #rrggbb and #rrggbbaa into unit floats', () => {
    // Arrange
    const inputs = ['#ff0000', '#00ff0080'];

    // Act
    const out = inputs.map((c) => parseColor(c));

    // Assert
    expect(out[0]).toEqual([1, 0, 0, 1]);
    expect(out[1]?.[1]).toBe(1);
    expect(out[1]?.[3]).toBeCloseTo(128 / 255, 6);
  });
});

describe('LineBatch', () => {
  it('packs one instance per segment with the documented layout', () => {
    // Arrange
    const b = new LineBatch();

    // Act
    b.segment({ x: 1, y: 2 }, { x: 3, y: 4 }, '#ffffff', { width: 2, dash: [4, 2] });
    const batch = b.finish();

    // Assert
    expect(batch.kind).toBe('lines');
    expect(batch.count).toBe(1);
    expect(batch.data.length).toBe(LINE_STRIDE);
    expect([...batch.data.subarray(0, 11)]).toEqual([1, 2, 0, 0, 3, 4, 0, 0, 2, 4, 2]);
    expect([...batch.data.subarray(11, 15)]).toEqual([1, 1, 1, 1]);
  });

  it('accepts pixel offsets on either end', () => {
    // Arrange
    const b = new LineBatch();

    // Act
    b.segment({ x: 0, y: 0, px: 3, py: -3 }, { x: 0, y: 0, px: 10, py: -10 }, '#000000');
    const batch = b.finish();

    // Assert
    expect([...batch.data.subarray(0, 8)]).toEqual([0, 0, 3, -3, 0, 0, 10, -10]);
    expect(batch.data[8]).toBe(1);
  });

  it('grows past its initial capacity', () => {
    // Arrange
    const b = new LineBatch(2);

    // Act
    for (let i = 0; i < 100; i++) b.segment({ x: i, y: 0 }, { x: i, y: 1 }, '#ffffff');
    const batch = b.finish();

    // Assert
    expect(batch.count).toBe(100);
    expect(batch.data.length).toBe(100 * LINE_STRIDE);
    expect(batch.data[99 * LINE_STRIDE]).toBe(99);
  });
});

describe('MarkerBatch', () => {
  it('packs anchor, offset, size, shape and color', () => {
    // Arrange
    const b = new MarkerBatch();

    // Act
    b.marker({ x: 5, y: 6 }, Shape.Diamond, 8, '#0000ff');
    const batch = b.finish();

    // Assert
    expect(batch.kind).toBe('markers');
    expect(batch.data.length).toBe(MARKER_STRIDE);
    expect([...batch.data.subarray(0, 10)]).toEqual([5, 6, 0, 0, 8, Shape.Diamond, 0, 0, 1, 1]);
  });
});

describe('TextBatch', () => {
  const atlas = {
    width: 80,
    height: 160,
    cellW: 10,
    cellH: 20,
    columns: 8,
    fontSize: 40,
    buffer: 2,
    baseline: 16,
    advance: 6,
    chars: 'AB',
  };

  it('lays out one quad per glyph, advancing by the scaled advance', () => {
    // Arrange
    const b = new TextBatch(atlas);

    // Act
    b.text('AB', { x: 0, y: 0 }, 20, '#ffffff');
    const batch = b.finish();

    // Assert
    expect(batch.kind).toBe('text');
    expect(batch.count).toBe(2);
    expect(batch.data.length).toBe(2 * TEXT_STRIDE);
    const scale = 20 / 40;
    // Glyph quad: offset (px, py), size (w, h), uv rect.
    expect([...batch.data.subarray(2, 6)]).toEqual([
      -2 * scale,
      -2 * scale,
      10 * scale,
      20 * scale,
    ]);
    expect([...batch.data.subarray(6, 10)]).toEqual([0, 0, 0.125, 0.125]);
    expect(batch.data[TEXT_STRIDE + 2]).toBeCloseTo(6 * scale - 2 * scale, 6);
    expect([...batch.data.subarray(TEXT_STRIDE + 6, TEXT_STRIDE + 10)]).toEqual([
      0.125, 0, 0.25, 0.125,
    ]);
  });

  it('right-aligns by shifting the run left by its width', () => {
    // Arrange
    const b = new TextBatch(atlas);

    // Act
    b.text('AB', { x: 0, y: 0 }, 20, '#ffffff', { align: 'right' });
    const batch = b.finish();

    // Assert
    const scale = 20 / 40;
    expect(batch.data[2]).toBeCloseTo(-2 * 6 * scale - 2 * scale, 6);
  });

  it('draws a placeholder for a glyph the atlas lacks, keeping the run its full width', () => {
    // Arrange
    const b = new TextBatch(atlas);

    // Act
    b.text('A\u3042B', { x: 0, y: 0 }, 20, '#ffffff');
    const batch = b.finish();

    // Assert
    expect(batch.count).toBe(3);
    expect(b.measure('A\u3042B', 20)).toBe(b.measure('ABC', 20));
  });

  it('advances over spaces without emitting a quad', () => {
    // Arrange
    const b = new TextBatch({ ...atlas, chars: 'AB ' });

    // Act
    b.text('A B', { x: 0, y: 0 }, 20, '#ffffff');
    const batch = b.finish();

    // Assert
    expect(batch.count).toBe(2);
    expect(batch.data[TEXT_STRIDE + 2]).toBeCloseTo(2 * 6 * (20 / 40) - 2 * (20 / 40), 6);
  });

  it('measures a run in CSS pixels', () => {
    // Arrange
    const b = new TextBatch(atlas);

    // Act
    const w = b.measure('ABAB', 20);

    // Assert
    expect(w).toBe(12);
  });
});
