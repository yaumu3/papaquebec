import { describe, expect, it } from 'bun:test';

import { type ChartItem, chartOf } from '../lib/chart';
import { blockOffset, DB_WIDTH } from '../lib/datablock';
import { direct, inverse } from '../lib/geodesic';
import type { ScopeLayer } from '../lib/layers';
import { parseMapSet } from '../lib/mapset';
import { EXAMPLE } from '../lib/mapsetCorpus';
import type { View } from '../render/protocol';
import { makeTrack } from '../render/scene/trackFixture';
import { toScreen } from '../render/scene/view';
import type { Rbl } from '../state/scope';
import { drawnBlockRect, fixNear, rblNear } from './hit';

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
    const t = makeTrack({ ops: { dir: 0, movedAt: 990, manual: false } });
    const drawn = { dx: 12, dy: -30 };

    // Act
    const r = drawnBlockRect(t, 100, 200, drawn);

    // Assert
    expect(r).toEqual({ x0: 112, y0: 170, x1: 112 + DB_WIDTH, y1: 196 });
  });

  it("is at the block's bearing before the block has been drawn", () => {
    // Arrange
    const t = makeTrack({ ops: { dir: 0, movedAt: 990, manual: false } });
    const rest = blockOffset(0, 0);

    // Act
    const r = drawnBlockRect(t, 100, 200, undefined);

    // Assert
    expect(r.x0).toBe(100 + rest.dx);
    expect(r.y0).toBe(200 + rest.dy);
  });
});

const at = (lon: number, lat: number) => ({ x: lon, y: lat });

describe('fixNear', () => {
  const stepped: ChartItem = {
    key: 'stepped',
    layer: 'vfr',
    parts: [
      {
        geometry: { type: 'Point', coordinates: [127, 36] },
        properties: { layer: 'vfr', id: 'XSTEP' },
      },
      {
        geometry: { type: 'Point', coordinates: [127.5, 36.5] },
        properties: { layer: 'vfr', id: 'XSTEP' },
      },
    ],
  };
  const chart = [...chartOf([parseMapSet(EXAMPLE)]), stepped];
  it('snaps onto a shown fix, VFR point or navaid, and onto nothing else', () => {
    // Arrange
    const reach = 0.01;
    const rows: {
      name: string;
      shown: ScopeLayer[];
      where: [number, number];
      found: string | null;
    }[] = [
      { name: 'a shown fix', shown: ['fix'], where: [130.93, 33.47], found: 'TAVRO' },
      { name: 'a fix whose layer is hidden', shown: ['vfr'], where: [130.93, 33.47], found: null },
      { name: 'a shown VFR point', shown: ['vfr'], where: [130.31, 33.66], found: 'CAUSEWAY' },
      { name: 'a shown navaid', shown: ['navaid'], where: [130.4406, 33.5967], found: 'QDG' },
      {
        name: 'the first part of a stepped VFR item',
        shown: ['vfr'],
        where: [127, 36],
        found: 'XSTEP',
      },
      {
        name: 'the later part of a stepped VFR item',
        shown: ['vfr'],
        where: [127.5, 36.5],
        found: 'XSTEP',
      },
      { name: 'a navaid with nothing shown', shown: [], where: [130.4406, 33.5967], found: null },
      {
        name: 'an aerodrome, which is not a fix',
        shown: ['ad'],
        where: [130.4508, 33.5859],
        found: null,
      },
      { name: 'open ground', shown: ['fix', 'vfr', 'navaid'], where: [128, 36], found: null },
    ];

    // Act
    const found = rows.map((r) =>
      fixNear(chart, (l) => r.shown.includes(l), at(...r.where), reach, plane.project),
    );

    // Assert
    expect(found.map((f) => f?.name ?? null)).toEqual(rows.map((r) => r.found));
  });

  it('snaps onto the nearest of the fixes in reach', () => {
    // Arrange
    const reach = 1;
    const rows: { near: string; where: [number, number] }[] = [
      { near: 'TAVRO', where: [130.94, 33.48] },
      { near: 'NIMBA', where: [131.17, 34.03] },
      { near: 'ZOLEK', where: [131.91, 34.31] },
    ];

    // Act
    const found = rows.map((r) =>
      fixNear(chart, (l) => l === 'fix', at(...r.where), reach, plane.project),
    );

    // Assert
    expect(found.map((f) => f?.name)).toEqual(rows.map((r) => r.near));
  });

  it('reports where the fix is on the plane', () => {
    // Arrange
    const [lon, lat] = [130.93, 33.47];

    // Act
    const fix = fixNear(chart, () => true, at(lon, lat), 0.01, plane.project);

    // Assert
    expect(fix).toEqual({ name: 'TAVRO', x: lon, y: lat });
  });
});
