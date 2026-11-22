import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { clamp } from '../../lib/math';
import type { View } from '../../render/protocol';
import { toWorld } from '../../render/scene/view';
import { RANGE_MAX_NM, RANGE_MIN_NM } from '../../state/settingsDefaults';
import { pxPerNmFor } from '../view';
import { zoomAbout, zoomMoving } from './geometry';

const view = (rangeNm: number, cx = 0, cy = 0): View => ({
  centerX: cx,
  centerY: cy,
  pxPerNm: pxPerNmFor(800, 600, rangeNm),
  widthPx: 800,
  heightPx: 600,
  dpr: 1,
});

/** A range the scope allows. */
const anyRange = fc.double({ min: RANGE_MIN_NM, max: RANGE_MAX_NM, noNaN: true });
/** A point on the 800 by 600 canvas of `view`. */
const anyOnCanvas = fc.record({
  x: fc.double({ min: 0, max: 800, noNaN: true }),
  y: fc.double({ min: 0, max: 600, noNaN: true }),
});
/** A view at an allowed range, with another allowed range to zoom it to. */
const anyZoom = fc.record({
  rangeNm: anyRange,
  toNm: anyRange,
  cx: fc.double({ min: -500, max: 500, noNaN: true }),
  cy: fc.double({ min: -500, max: 500, noNaN: true }),
});

describe('zoomAbout', () => {
  it('scales the range and keeps the world point under the cursor fixed', () => {
    // Arrange
    const anyCursor = anyOnCanvas;

    fc.assert(
      fc.property(anyZoom, anyCursor, ({ rangeNm, toNm, cx, cy }, cursor) => {
        // Arrange
        const v = view(rangeNm, cx, cy);
        const before = toWorld(v, cursor.x, cursor.y);

        // Act
        const out = zoomAbout(v, rangeNm, cursor.x, cursor.y, toNm / rangeNm);

        // Assert
        expect(out.rangeNm).toBeCloseTo(toNm, 6);
        const after = toWorld(view(out.rangeNm, out.pan.x, out.pan.y), cursor.x, cursor.y);
        expect(after.x).toBeCloseTo(before.x, 6);
        expect(after.y).toBeCloseTo(before.y, 6);
      }),
    );
  });

  it('clamps the range to the allowed span', () => {
    // Arrange: factors that reach well past either end of the span
    const anyFactor = fc.double({ min: 0.001, max: 1000, noNaN: true });

    fc.assert(
      fc.property(anyRange, anyFactor, (rangeNm, factor) => {
        // Act
        const out = zoomAbout(view(rangeNm), rangeNm, 400, 300, factor);

        // Assert
        expect(out.rangeNm).toBe(clamp(rangeNm * factor, RANGE_MIN_NM, RANGE_MAX_NM));
      }),
    );
  });
});

describe('zoomMoving', () => {
  it('scales about the anchor and carries the world point under it to the destination', () => {
    // Arrange
    const anyMove = fc.record({ anchor: anyOnCanvas, to: anyOnCanvas });

    fc.assert(
      fc.property(anyZoom, anyMove, ({ rangeNm, toNm, cx, cy }, { anchor, to }) => {
        // Arrange
        const v = view(rangeNm, cx, cy);
        const anchorWorld = toWorld(v, anchor.x, anchor.y);

        // Act
        const out = zoomMoving(v, rangeNm, anchor, toNm / rangeNm, to);

        // Assert
        expect(out.rangeNm).toBeCloseTo(toNm, 6);
        const after = toWorld(view(out.rangeNm, out.pan.x, out.pan.y), to.x, to.y);
        expect(after.x).toBeCloseTo(anchorWorld.x, 6);
        expect(after.y).toBeCloseTo(anchorWorld.y, 6);
      }),
    );
  });
});
