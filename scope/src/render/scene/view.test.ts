import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

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
    const anyView = fc.record({
      centerX: fc.double({ min: -1000, max: 1000, noNaN: true }),
      centerY: fc.double({ min: -1000, max: 1000, noNaN: true }),
      pxPerNm: fc.double({ min: 0.1, max: 200, noNaN: true }),
      widthPx: fc.integer({ min: 100, max: 4000 }),
      heightPx: fc.integer({ min: 100, max: 4000 }),
      dpr: fc.constantFrom(1, 2, 3),
    });
    const anyPoint = fc.record({
      x: fc.double({ min: -2000, max: 2000, noNaN: true }),
      y: fc.double({ min: -2000, max: 2000, noNaN: true }),
    });

    fc.assert(
      fc.property(anyView, anyPoint, (v, p) => {
        // Arrange
        const s = toScreen(v, p.x, p.y);

        // Act
        const back = toWorld(v, s.cx, s.cy);

        // Assert
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }),
    );
  });
});
