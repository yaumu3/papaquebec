import { describe, expect, it } from 'bun:test';

import type { View } from '../render/protocol';
import { toWorld } from '../render/scene/view';
import { pinchZoom, zoomAbout } from './gestures';
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
