import { describe, expect, it } from 'bun:test';

import { direct, inverse } from '../lib/geodesic';
import type { View } from '../render/protocol';
import { toScreen } from '../render/scene/view';
import type { Rbl } from '../state/scope';
import { rblNear } from './hit';

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
