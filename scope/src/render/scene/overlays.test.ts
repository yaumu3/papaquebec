import { describe, expect, it } from 'bun:test';

import type { Batch } from '../protocol';
import { atlas } from './atlasFixture';
import { buildOverlays, type OverlayInput } from './overlays';

/** Longitude and latitude as the scope plane, so long lines curve on it. */
const lonLat = {
  project: (lat: number, lon: number) => ({ x: lon, y: lat }),
  unproject: (x: number, y: number) => ({ lat: y, lon: x }),
};

function overlays(over: Partial<OverlayInput>): OverlayInput {
  return {
    tracks: new Map(),
    rbls: [],
    rblPending: null,
    rangeCursor: null,
    pointer: null,
    declination: () => 0,
    ...lonLat,
    view: { centerX: 140, centerY: 35, pxPerNm: 20, widthPx: 800, heightPx: 600, dpr: 1 },
    atlas,
    snap: () => null,
    ...over,
  };
}

/** An RBL along latitude 35° from longitude 130° to `x`. */
const rbl = (x: number) => ({
  a: { kind: 'free' as const, x: 130, y: 35 },
  b: { kind: 'free' as const, x, y: 35 },
  tag: 'A',
});

const segments = (batches: Batch[]) => batches.find((b) => b.kind === 'lines')?.count ?? 0;

describe('buildOverlays', () => {
  it('draws a short RBL as one segment and a long one along its geodesic', () => {
    // Arrange
    const cases = [rbl(130.05), rbl(150)];

    // Act
    const drawn = cases.map((r) => segments(buildOverlays(overlays({ rbls: [r] }))));

    // Assert
    expect(drawn[0]).toBe(1);
    expect(drawn[1]).toBeGreaterThan(1);
  });
});
