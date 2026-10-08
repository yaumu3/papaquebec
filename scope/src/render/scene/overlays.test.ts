import { describe, expect, it } from 'bun:test';

import type { Vec2 } from '../../lib/geo';
import type { Batch } from '../protocol';
import { atlas } from './atlasFixture';
import { buildOverlays, type OverlayInput, rblLines } from './overlays';

/** An RBL end at `lat`, `lon`, drawn at `pos` on the scope plane. */
const end = (lat: number, lon: number, pos: Vec2 = { x: 0, y: 0 }, vel: Vec2 | null = null) => ({
  pos,
  geo: { lat, lon },
  vel,
  label: '',
});

/** Ten minutes of longitude east along the equator: 10.0 NM on course 090. */
const EAST = 10 / 60;

describe('rblLines', () => {
  it('shows distance and the bearing made magnetic at the origin, with a degree sign', () => {
    // Arrange: a declination of 7.5° east at the origin and nothing like it at the far end
    const a = end(0, 0);
    const b = end(0, EAST, { x: 10, y: 0 });
    const declination = (_lat: number, lon: number) => (lon === 0 ? 7.5 : -20);

    // Act
    const lines = rblLines(a, b, declination);

    // Assert
    expect(lines).toEqual(['10.0 / 083°']);
  });

  it('measures along the geodesic, not across the map the ends are drawn on', () => {
    // Arrange
    const a = end(35, 142);
    const b = end(36, 142, { x: 3, y: 60 });

    // Act
    const lines = rblLines(a, b, () => 0);

    // Assert
    expect(lines).toEqual(['59.9 / 360°']);
  });

  it('appends time to go along the geodesic when only the origin moves', () => {
    // Arrange
    const a = end(0, 0, { x: 0, y: 0 }, { x: 60, y: 0 });
    const b = end(0, EAST, { x: 10, y: 0 });

    // Act
    const lines = rblLines(a, b, () => 0);

    // Assert
    expect(lines).toEqual(['10.0 / 090° / 10:01']);
  });

  it('appends the closest approach, worked on the scope plane, when both move', () => {
    // Arrange
    const a = end(0, 0, { x: 0, y: 0 }, { x: 60, y: 0 });
    const b = end(0, EAST, { x: 10, y: 5 }, { x: 0, y: 0 });

    // Act
    const lines = rblLines(a, b, () => 0);

    // Assert
    expect(lines).toEqual(['10.0 / 090°', 'CPA 5.0 in 10:00']);
  });
});

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
