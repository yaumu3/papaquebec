import { describe, expect, it } from 'bun:test';

import type { View } from '../protocol';
import { toScreen, toWorld } from './view';

const view: View = { centerX: 10, centerY: 5, pxPerNm: 4, widthPx: 800, heightPx: 600, dpr: 2 };

describe('toScreen / toWorld', () => {
  it('maps the view center to the canvas center with y down', () => {
    // Arrange
    const points = [
      { x: 10, y: 5 },
      { x: 20, y: 5 },
      { x: 10, y: 15 },
    ];

    // Act
    const out = points.map((p) => toScreen(view, p.x, p.y));

    // Assert
    expect(out).toEqual([
      { cx: 400, cy: 300 },
      { cx: 440, cy: 300 },
      { cx: 400, cy: 260 },
    ]);
  });

  it('inverts toScreen', () => {
    // Arrange
    const p = { x: -3.25, y: 7.5 };
    const s = toScreen(view, p.x, p.y);

    // Act
    const back = toWorld(view, s.cx, s.cy);

    // Assert
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });
});
