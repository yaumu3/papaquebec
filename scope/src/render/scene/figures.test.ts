import { describe, expect, it } from 'bun:test';

import type { Figure } from '../../lib/figure';
import { LINE_STRIDE, MARKER_STRIDE, Shape } from '../protocol';
import { putFigure } from './figures';
import { LineBatch, MarkerBatch } from './pack';

const AT = { x: 10, y: 20 };
const COLOR = '#ff0000';

function drawn(figure: Figure) {
  const lines = new LineBatch();
  const markers = new MarkerBatch();
  putFigure({ lines, markers }, AT, figure, COLOR);
  return { lines: lines.finish(), markers: markers.finish() };
}

/** Each segment as its two anchors' offsets (`apx apy bpx bpy`) and its width. */
const segments = ({ count, data }: { count: number; data: Float32Array }) =>
  Array.from({ length: count }, (_, i) => {
    const s = data.subarray(i * LINE_STRIDE, (i + 1) * LINE_STRIDE);
    return { world: [s[0], s[1], s[4], s[5]], offsets: [s[2], s[3], s[6], s[7]], width: s[8] };
  });

const triangle = (closed: boolean): Figure => ({
  strokes: [
    {
      points: [
        { x: 0, y: -3 },
        { x: 3, y: 2 },
        { x: -3, y: 2 },
      ],
      closed,
      width: 1.5,
    },
  ],
  discs: [],
});

describe('putFigure', () => {
  it('draws a stroke as segments about its anchor, at its width', () => {
    // Arrange
    const figure = triangle(false);

    // Act
    const { lines } = drawn(figure);

    // Assert
    expect(segments(lines)).toEqual([
      { world: [10, 20, 10, 20], offsets: [0, -3, 3, 2], width: 1.5 },
      { world: [10, 20, 10, 20], offsets: [3, 2, -3, 2], width: 1.5 },
    ]);
  });

  it('closes a closed stroke back to its first point', () => {
    // Arrange
    const figure = triangle(true);

    // Act
    const { lines } = drawn(figure);

    // Assert
    expect(segments(lines).map((s) => s.offsets)).toEqual([
      [0, -3, 3, 2],
      [3, 2, -3, 2],
      [-3, 2, 0, -3],
    ]);
  });

  it('draws a disc as a disc marker as wide as it is', () => {
    // Arrange
    const figure: Figure = { strokes: [], discs: [{ at: { x: 2, y: -1 }, radius: 0.6 }] };

    // Act
    const { markers } = drawn(figure);

    // Assert
    expect(markers.count).toBe(1);
    expect([...markers.data.subarray(0, 6)]).toEqual([10, 20, 2, -1, Math.fround(1.2), Shape.Disc]);
    expect(markers.data.length).toBe(MARKER_STRIDE);
  });
});
