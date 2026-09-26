import { describe, expect, it } from 'bun:test';

import type { View } from '../render/protocol';
import { toWorld } from '../render/scene/view';
import { dragZoom, isDoubleTap, pinchZoom, zoomAbout } from './gestures';
import { pxPerNmFor } from './view';

const view = (rangeNm: number, cx = 0, cy = 0): View => ({
  centerX: cx,
  centerY: cy,
  pxPerNm: pxPerNmFor(800, 600, rangeNm),
  widthPx: 800,
  heightPx: 600,
  dpr: 1,
});

describe('zoomAbout', () => {
  it('scales the range and keeps the world point under the cursor fixed', () => {
    // Arrange
    const v = view(40);
    const before = toWorld(v, 600, 200);

    // Act
    const out = zoomAbout(v, 40, 600, 200, 0.5);

    // Assert
    expect(out.rangeNm).toBe(20);
    const after = toWorld(
      { ...v, centerX: out.pan.x, centerY: out.pan.y, pxPerNm: pxPerNmFor(800, 600, 20) },
      600,
      200,
    );
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('clamps the range to the allowed span', () => {
    // Arrange
    const v = view(40);

    // Act
    const out = [zoomAbout(v, 40, 400, 300, 0.01), zoomAbout(v, 40, 400, 300, 100)];

    // Assert
    expect(out.map((o) => o.rangeNm)).toEqual([5, 400]);
  });
});

describe('pinchZoom', () => {
  it('zooms by the change in finger distance and pans with the midpoint', () => {
    // Arrange
    const v = view(40);
    const start = [
      { x: 300, y: 300 },
      { x: 500, y: 300 },
    ] as const;
    const end = [
      { x: 250, y: 320 },
      { x: 650, y: 320 },
    ] as const;
    const midBefore = toWorld(v, 400, 300);

    // Act
    const out = pinchZoom(v, 40, start, end);

    // Assert
    expect(out.rangeNm).toBeCloseTo(20, 6);
    const after = toWorld(
      { ...v, centerX: out.pan.x, centerY: out.pan.y, pxPerNm: pxPerNmFor(800, 600, out.rangeNm) },
      450,
      320,
    );
    expect(after.x).toBeCloseTo(midBefore.x, 6);
    expect(after.y).toBeCloseTo(midBefore.y, 6);
  });
});

describe('dragZoom', () => {
  it('zooms in as the finger drags up and out as it drags down, about the anchor', () => {
    // Arrange
    const v = view(40);
    const anchor = { x: 600, y: 200 };
    const before = toWorld(v, anchor.x, anchor.y);

    // Act
    const out = [-150, 150].map((dy) => dragZoom(v, 40, anchor, dy));

    // Assert
    expect(out[0]?.rangeNm).toBeCloseTo(20, 6);
    expect(out[1]?.rangeNm).toBeCloseTo(80, 6);
    for (const o of out) {
      const after = toWorld(
        { ...v, centerX: o.pan.x, centerY: o.pan.y, pxPerNm: pxPerNmFor(800, 600, o.rangeNm) },
        anchor.x,
        anchor.y,
      );
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    }
  });
});

describe('isDoubleTap', () => {
  it('pairs a touch-down with a tap only when it lands soon and nearby', () => {
    // Arrange
    const tap = { x: 100, y: 100, t: 1000 };
    const cases = [
      { down: { x: 110, y: 95, t: 1200 }, want: true },
      { down: { x: 100, y: 100, t: 1400 }, want: false },
      { down: { x: 160, y: 100, t: 1100 }, want: false },
    ];

    // Act
    const got = cases.map((c) => isDoubleTap(tap, c.down));

    // Assert
    expect(got).toEqual(cases.map((c) => c.want));
  });

  it('is never a double tap without an earlier tap', () => {
    // Arrange
    const down = { x: 100, y: 100, t: 1000 };

    // Act
    const got = isDoubleTap(null, down);

    // Assert
    expect(got).toBe(false);
  });
});
