import { describe, expect, it } from 'bun:test';

import { CHART_COLORS } from '../../design/palette';
import { type ChartItem, chartOf } from '../../lib/chart';
import { northAt, type ProjectFn, type Vec2 } from '../../lib/geo';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import type { Layer } from '../../lib/mapsetFormat';
import { allShown, hiddenExcept } from '../../lib/visibilityFixture';
import {
  packed,
  project,
  sceneOf,
  type SceneOptions,
  type Segment,
  segments,
} from './chartFixture';

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

const FIX_HIDDEN = (layer: Layer) => (layer === 'fix' ? hiddenExcept() : allShown());
const WEST_DECLINATION = () => () => -7;

/** The route slice's lines for the chart, the holds only unless `options` name more layers. */
const linesOf = (chart: readonly ChartItem[], options: SceneOptions = {}) =>
  segments(
    sceneOf([...chart], { layers: ['hold'], declinationAt: WEST_DECLINATION, ...options }).shapes()
      .lines,
  );

const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-4;

/** The segment that ends at the fix: the end of the inbound leg. */
const inboundLeg = (drawn: Segment[]) => {
  const leg = drawn.find((s) => s.width === 1 && near(s.offsetB, { x: 0, y: 0 }));
  if (!leg) throw new Error('no inbound leg');
  return leg;
};

/**
 * The inbound leg's direction in degrees clockwise from true north, given where north lies on
 * the screen.
 */
function trackOnScreen(leg: Segment, north: Vec2): number {
  const d = { x: leg.offsetB.x - leg.offsetA.x, y: leg.offsetB.y - leg.offsetA.y };
  const up = { x: north.x, y: -north.y };
  const degrees = (Math.atan2(up.x * d.y - up.y * d.x, up.x * d.x + up.y * d.y) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

const NORTH_UP = { x: 0, y: 1 };

describe('the holds of the chart', () => {
  it('draws the example RNAV hold at NIMBA in the RNAV colour along 198 degrees true', () => {
    // Arrange
    const hold = RNAV_HOLD;
    const rnav = packed(CHART_COLORS.rnav);

    // Act
    const drawn = linesOf([hold]);

    // Assert
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every((s) => s.color.every((c, i) => c === rnav[i]))).toBe(true);
    expect(trackOnScreen(inboundLeg(drawn), NORTH_UP)).toBeCloseTo(198, 1);
  });

  it('draws the other in the CONV colour along 18 degrees true with a declination of -7', () => {
    // Arrange
    const hold = CONV_HOLD;
    const conv = packed(CHART_COLORS.conv);

    // Act
    const drawn = linesOf([hold]);

    // Assert
    expect(drawn.every((s) => s.color.every((c, i) => c === conv[i]))).toBe(true);
    expect(trackOnScreen(inboundLeg(drawn), NORTH_UP)).toBeCloseTo(18, 1);
  });

  it('draws a different racetrack when the declination changes', () => {
    // Arrange
    const west = linesOf([CONV_HOLD]);

    // Act
    const none = linesOf([CONV_HOLD], { declinationAt: () => () => 0 });

    // Assert
    expect(trackOnScreen(inboundLeg(none), NORTH_UP)).toBeCloseTo(25, 1);
    expect(trackOnScreen(inboundLeg(west), NORTH_UP)).toBeCloseTo(18, 1);
  });

  it('draws a racetrack at screen size: every anchor is its fix on the plane', () => {
    // Arrange
    const chart = [RNAV_HOLD, CONV_HOLD];

    // Act
    const drawn = linesOf(chart);

    // Assert
    expect(drawn.length).toBeGreaterThan(0);
    for (const s of drawn) {
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
    const drawn = linesOf([RNAV_HOLD], { project: turned });

    // Assert
    const north = northAt(turned, 34.02, 131.16);
    expect(trackOnScreen(inboundLeg(drawn), north)).toBeCloseTo(198, 1);
  });

  it('reads the declination only for a drawn hold without inboundTrue', () => {
    // Arrange
    const rows: { chart: ChartItem[]; layers: Layer[] }[] = [
      { chart: [RNAV_HOLD], layers: ['hold'] },
      { chart: [RNAV_HOLD, CONV_HOLD], layers: ['hold'] },
      { chart: [RNAV_HOLD, CONV_HOLD], layers: ['ctr'] },
    ];
    const counts = rows.map(() => 0);

    // Act
    rows.forEach(({ chart, layers }, i) => {
      const declinationAt = () => {
        counts[i] = (counts[i] ?? 0) + 1;
        return () => -7;
      };
      linesOf(chart, { layers, declinationAt });
    });

    // Assert
    expect(counts.map((count) => count > 0)).toEqual([false, true, false]);
  });

  it('draws nothing for a hidden hold item', () => {
    // Arrange
    const shown = linesOf([RNAV_HOLD]);

    // Act
    const drawn = linesOf([RNAV_HOLD], { hidden: [RNAV_HOLD.key] });

    // Assert
    expect(shown.length).toBeGreaterThan(0);
    expect(drawn).toEqual([]);
  });

  it('draws a hold whose fix is hidden', () => {
    // Arrange
    const layers: Layer[] = ['fix', 'hold'];
    const withFixShown = linesOf(CHART, { layers });
    const fixMarkers = sceneOf(CHART, { layers }).shapes().markers.count;

    // Act
    const drawn = linesOf(CHART, { layers, stateOf: FIX_HIDDEN });

    // Assert
    expect(fixMarkers).toBeGreaterThan(0);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn).toHaveLength(withFixShown.length);
  });

  it('draws two racetracks for two holds at one fix', () => {
    // Arrange
    const one = linesOf([RNAV_HOLD]).length;

    // Act
    const both = linesOf([RNAV_HOLD, CONV_HOLD]);

    // Assert
    expect(one).toBeGreaterThan(0);
    expect(both).toHaveLength(2 * one);
  });
});
