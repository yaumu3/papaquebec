import { describe, expect, it } from 'bun:test';

import { CHART_COLORS } from '../../design/palette';
import { type ChartItem, chartOf } from '../../lib/chart';
import { northAt, type ProjectFn, type Vec2 } from '../../lib/geo';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import type { Layer } from '../../lib/mapsetFormat';
import { drawnPointsOf, topologyOf } from '../../lib/topology';
import { type LayerState, drawnItemsOf } from '../../lib/visibility';
import { allShown, hiddenExcept, shownExcept } from '../../lib/visibilityFixture';
import type { Declination } from '../../lib/wmm';
import { buildShapes } from './chart';
import { type Instance, instances, packed, project } from './chartFixture';

const NIMBA = project(34.02, 131.16);
const CHART = chartOf([parseMapSet(EXAMPLE)]);
const holdsAt = (turn: 'L' | 'R') =>
  CHART.filter(
    (item) =>
      item.layer === 'hold' &&
      item.parts.some((part) => 'turn' in part.properties && part.properties.turn === turn),
  );
const [RNAV_HOLD] = holdsAt('R');
const [CONV_HOLD] = holdsAt('L');
if (!RNAV_HOLD || !CONV_HOLD) throw new Error('the example has no two holds at NIMBA');

interface Reads {
  stateOf?: (layer: Layer) => LayerState;
  projectFn?: ProjectFn;
}

/** The route slice's lines for the chart, with the declination the stub gives. */
function linesOf(
  chart: readonly ChartItem[],
  declination: Declination = () => -7,
  { stateOf = allShown, projectFn = project }: Reads = {},
  layers: readonly Layer[] = ['hold'],
  onRead: () => void = () => {},
) {
  const topology = topologyOf(chart);
  const drawnItems = drawnItemsOf(chart, layers, stateOf, () => true);
  const drawnPoints = () => drawnPointsOf(topology, drawnItems);
  const input = {
    topology,
    drawnPoints,
    project: projectFn,
    layers,
    drawnItems,
  };
  const declinationAt = () => {
    onRead();
    return declination;
  };
  return instances(buildShapes(input, declinationAt).lines);
}

const offsetsOf = (segment: Instance) => [segment.offsetA, segment.offsetB];
const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-4;

/** The segment that ends at the fix: the end of the inbound leg. */
const inboundLeg = (segments: Instance[]) => {
  const leg = segments.find((s) => s.width === 1 && near(s.offsetB, { x: 0, y: 0 }));
  if (!leg) throw new Error('no inbound leg');
  return leg;
};

/**
 * The inbound leg's direction in degrees clockwise from true north, given where north lies on
 * the screen.
 */
function trackOnScreen(leg: Instance, north: Vec2): number {
  const d = { x: leg.offsetB.x - leg.offsetA.x, y: leg.offsetB.y - leg.offsetA.y };
  const up = { x: north.x, y: -north.y };
  const degrees = (Math.atan2(up.x * d.y - up.y * d.x, up.x * d.x + up.y * d.y) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

const NORTH_UP = { x: 0, y: 1 };
const HIDING_RNAV = () => shownExcept(RNAV_HOLD.key);
const WEST_DECLINATION = () => -7;
const FIX_HIDDEN = (layer: Layer) => (layer === 'fix' ? hiddenExcept() : allShown());

/** The side of the inbound leg that the outline lies on: positive to its right on the screen. */
function sideOf(segments: Instance[]): number {
  const leg = inboundLeg(segments);
  const d = { x: leg.offsetB.x - leg.offsetA.x, y: leg.offsetB.y - leg.offsetA.y };
  const outline = segments.filter((s) => s.width === 1).flatMap(offsetsOf);
  const mean = {
    x: outline.reduce((sum, p) => sum + p.x, 0) / outline.length,
    y: outline.reduce((sum, p) => sum + p.y, 0) / outline.length,
  };
  return mean.x * -d.y + mean.y * d.x;
}

/** The four segments of the two chevrons, two each. */
function chevronsOf(segments: Instance[]): [Instance, Instance, Instance, Instance] {
  const [a, b, c, d, ...rest] = segments.filter((s) => Math.abs(s.width - 1.2) < 1e-3);
  if (!a || !b || !c || !d || rest.length > 0) throw new Error('expected four chevron segments');
  return [a, b, c, d];
}

describe('buildShapes holds', () => {
  it('draws the example RNAV hold at NIMBA in the RNAV colour along 198 degrees true', () => {
    // Arrange
    const hold = RNAV_HOLD;
    const declination = WEST_DECLINATION;

    // Act
    const segments = linesOf([hold], declination);

    // Assert
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((s) => s.color.every((c, i) => c === packed(CHART_COLORS.rnav)[i]))).toBe(
      true,
    );
    expect(trackOnScreen(inboundLeg(segments), NORTH_UP)).toBeCloseTo(198, 1);
  });

  it('draws the other in the CONV colour along 18 degrees true with a declination of -7', () => {
    // Arrange
    const hold = CONV_HOLD;
    const declination = WEST_DECLINATION;

    // Act
    const segments = linesOf([hold], declination);

    // Assert
    expect(segments.every((s) => s.color.every((c, i) => c === packed(CHART_COLORS.conv)[i]))).toBe(
      true,
    );
    expect(trackOnScreen(inboundLeg(segments), NORTH_UP)).toBeCloseTo(18, 1);
  });

  it('draws a different racetrack when the declination changes', () => {
    // Arrange
    const west = linesOf([CONV_HOLD], () => -7);

    // Act
    const none = linesOf([CONV_HOLD], () => 0);

    // Assert
    expect(trackOnScreen(inboundLeg(none), NORTH_UP)).toBeCloseTo(25, 1);
    expect(trackOnScreen(inboundLeg(west), NORTH_UP)).toBeCloseTo(18, 1);
  });

  it('turns the two NIMBA holds opposite ways, each inbound leg at the fix', () => {
    // Arrange
    const holds = [RNAV_HOLD, CONV_HOLD];

    // Act
    const sides = holds.map((hold) => sideOf(linesOf([hold])));

    // Assert
    expect(sides[0]).toBeGreaterThan(0);
    expect(sides[1]).toBeLessThan(0);
  });

  it('puts each chevron tip at its leg midpoint, abeam, pointing the way it is flown', () => {
    // Arrange
    const hold = RNAV_HOLD;

    // Act
    const segments = linesOf([hold]);

    // Assert
    const leg = inboundLeg(segments);
    const d = { x: leg.offsetB.x - leg.offsetA.x, y: leg.offsetB.y - leg.offsetA.y };
    const unit = { x: d.x / 18, y: d.y / 18 };
    const [inboundIn, inboundOut, outboundIn, outboundOut] = chevronsOf(segments);
    const tipIn = inboundIn.offsetB;
    const tipOut = outboundIn.offsetB;
    expect(near(tipIn, { x: leg.offsetA.x + d.x / 2, y: leg.offsetA.y + d.y / 2 })).toBe(true);
    expect(near(inboundOut.offsetA, tipIn)).toBe(true);
    expect(near(outboundOut.offsetA, tipOut)).toBe(true);
    expect((tipOut.x - tipIn.x) * unit.x + (tipOut.y - tipIn.y) * unit.y).toBeCloseTo(0, 3);
    expect(Math.hypot(tipOut.x - tipIn.x, tipOut.y - tipIn.y)).toBeCloseTo(12, 3);
    const behind = (c: Instance) =>
      (c.offsetA.x - c.offsetB.x) * unit.x + (c.offsetA.y - c.offsetB.y) * unit.y;
    expect(behind(inboundIn)).toBeCloseTo(-5, 3);
    expect(behind(outboundIn)).toBeCloseTo(5, 3);
  });

  it('draws a racetrack at screen size: every anchor is its fix on the plane', () => {
    // Arrange
    const chart = [RNAV_HOLD, CONV_HOLD];

    // Act
    const segments = linesOf(chart);

    // Assert
    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) {
      expect(s.a).toEqual({ x: Math.fround(NIMBA.x), y: Math.fround(NIMBA.y) });
      expect(s.b).toEqual(s.a);
    }
  });

  it('orients a hold by true north at its fix on a turned plane', () => {
    // Arrange
    const angle = Math.PI / 6;
    const turned: ProjectFn = (lat, lon) => {
      const { x, y } = project(lat, lon);
      return {
        x: x * Math.cos(angle) - y * Math.sin(angle),
        y: x * Math.sin(angle) + y * Math.cos(angle),
      };
    };

    // Act
    const segments = linesOf([RNAV_HOLD], () => -7, { projectFn: turned });

    // Assert
    const north = northAt(turned, 34.02, 131.16);
    expect(trackOnScreen(inboundLeg(segments), north)).toBeCloseTo(198, 1);
  });

  it('reads the declination only for a drawn hold without inboundTrue', () => {
    // Arrange
    const rows: { chart: ChartItem[]; layers: Layer[] }[] = [
      { chart: [RNAV_HOLD], layers: ['hold'] },
      { chart: [RNAV_HOLD, CONV_HOLD], layers: ['hold'] },
      { chart: [RNAV_HOLD, CONV_HOLD], layers: ['ctr'] },
    ];

    // Act
    const reads = rows.map(({ chart, layers }) => {
      let count = 0;
      linesOf(chart, WEST_DECLINATION, {}, layers, () => count++);
      return count;
    });

    // Assert
    expect(reads.map((count) => count > 0)).toEqual([false, true, false]);
  });

  it('draws nothing for a hidden hold item', () => {
    // Arrange
    const stateOf = HIDING_RNAV;
    const shown = linesOf([RNAV_HOLD], WEST_DECLINATION);
    if (shown.length === 0) throw new Error('precondition: the shown hold draws');

    // Act
    const segments = linesOf([RNAV_HOLD], WEST_DECLINATION, { stateOf });

    // Assert
    expect(segments).toEqual([]);
  });

  it('draws a hold whose fix is hidden', () => {
    // Arrange
    const layers: Layer[] = ['fix', 'hold'];
    const fixAtNimba = CHART.some(
      (item) =>
        item.layer === 'fix' &&
        item.parts.some(
          ({ geometry }) =>
            geometry.type === 'Point' &&
            near(project(geometry.coordinates[1] ?? 0, geometry.coordinates[0] ?? 0), NIMBA),
        ),
    );
    if (!fixAtNimba) throw new Error('precondition: a fix at NIMBA');
    const withFixShown = linesOf(CHART, WEST_DECLINATION, {}, layers);

    // Act
    const segments = linesOf(CHART, WEST_DECLINATION, { stateOf: FIX_HIDDEN }, layers);

    // Assert
    expect(segments.length).toBeGreaterThan(0);
    expect(segments).toHaveLength(withFixShown.length);
  });

  it('draws two racetracks for two holds at one fix', () => {
    // Arrange
    const one = linesOf([RNAV_HOLD]).length;
    if (one === 0) throw new Error('precondition: a hold draws');

    // Act
    const both = linesOf([RNAV_HOLD, CONV_HOLD]);

    // Assert
    expect(both).toHaveLength(2 * one);
  });
});
