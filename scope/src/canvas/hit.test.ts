import { describe, expect, it } from 'bun:test';

import { blockOffset, DB_WIDTH } from '../lib/datablock';
import { direct, inverse } from '../lib/geodesic';
import type { View } from '../render/protocol';
import { makeTrack } from '../render/scene/trackFixture';
import { toScreen } from '../render/scene/view';
import type { Rbl } from '../state/scope';
import { drawnBlockRect, rblNear } from './hit';

/** Longitude and latitude as the scope plane, so a long line bows well clear of its chord. */
const plane = {
  tracks: new Map(),
  project: (lat: number, lon: number) => ({ x: lon, y: lat }),
  unproject: (x: number, y: number) => ({ lat: y, lon: x }),
};
const view: View = {
  centerX: 140,
  centerY: 35.5,
  pxPerNm: 20,
  widthPx: 800,
  heightPx: 600,
  dpr: 1,
};

describe('rblNear', () => {
  it('finds an RBL along the curve it is drawn on, not along the chord between its ends', () => {
    // Arrange
    const a = { lat: 35, lon: 130 };
    const b = { lat: 35, lon: 150 };
    const rbl: Rbl = {
      a: { kind: 'free', x: a.lon, y: a.lat },
      b: { kind: 'free', x: b.lon, y: b.lat },
      tag: 'A',
    };
    const leg = inverse(a, b);
    const mid = direct(a, leg.bearingTrue, leg.distanceNm / 2);
    const onCurve = toScreen(view, mid.lon, mid.lat);
    const onChord = toScreen(view, (a.lon + b.lon) / 2, a.lat);

    // Act
    const found = [onCurve, onChord].map((s) => rblNear([rbl], view, s.cx, s.cy, plane));

    // Assert
    expect(found).toEqual([rbl, null]);
  });
});

describe('drawnBlockRect', () => {
  it('is where the block was last drawn, so a block mid-slide is hit where it is seen', () => {
    // Arrange
    const t = makeTrack({ ops: { hideTrail: false, dir: 0, movedAt: 990, manual: false } });
    const drawn = { dx: 12, dy: -30 };

    // Act
    const r = drawnBlockRect(t, 100, 200, drawn);

    // Assert
    expect(r).toEqual({ x0: 112, y0: 170, x1: 112 + DB_WIDTH, y1: 196 });
  });

  it("is at the block's bearing before the block has been drawn", () => {
    // Arrange
    const t = makeTrack({ ops: { hideTrail: false, dir: 0, movedAt: 990, manual: false } });
    const rest = blockOffset(0, 0);

    // Act
    const r = drawnBlockRect(t, 100, 200, undefined);

    // Assert
    expect(r.x0).toBe(100 + rest.dx);
    expect(r.y0).toBe(200 + rest.dy);
  });
});
