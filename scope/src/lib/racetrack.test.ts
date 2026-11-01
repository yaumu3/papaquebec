import { describe, expect, it } from 'bun:test';

import type { Vec2 } from './geo';
import { inboundTrack, racetrack } from './racetrack';

const NORTH: Vec2 = { x: 0, y: -1 };
const EAST: Vec2 = { x: 1, y: 0 };

const at = (points: readonly Vec2[], index: number): Vec2 => {
  const point = points[index];
  if (!point) throw new Error(`no point ${index}`);
  return point;
};
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const centroid = (points: readonly Vec2[]): Vec2 => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});
const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const never = () => {
  throw new Error('the declination was read');
};

describe('racetrack', () => {
  it('ends the inbound leg at the fix, 18 px along the inbound track', () => {
    // Arrange
    const inbound = { x: 0.6, y: -0.8 };

    // Act
    const { outline } = racetrack(inbound, 'R');

    // Assert
    const fix = at(outline.points, 0);
    const start = at(outline.points, outline.points.length - 1);
    expect(fix.x).toBeCloseTo(0);
    expect(fix.y).toBeCloseTo(0);
    expect(dist(fix, start)).toBeCloseTo(18);
    expect((fix.x - start.x) / 18).toBeCloseTo(inbound.x);
    expect((fix.y - start.y) / 18).toBeCloseTo(inbound.y);
  });

  it('lies to the right of the inbound leg for R and to the left for L', () => {
    // Arrange
    const cases = [
      { inbound: NORTH, turn: 'R', turnSide: { x: 1, y: 0 } },
      { inbound: NORTH, turn: 'L', turnSide: { x: -1, y: 0 } },
      { inbound: EAST, turn: 'R', turnSide: { x: 0, y: 1 } },
      { inbound: EAST, turn: 'L', turnSide: { x: 0, y: -1 } },
    ] as const;

    // Act
    const sides = cases.map(({ inbound, turn, turnSide }) => {
      const middle = centroid(racetrack(inbound, turn).outline.points);
      return middle.x * turnSide.x + middle.y * turnSide.y;
    });

    // Assert
    expect(sides.every((side) => side > 5)).toBe(true);
  });

  it('joins the legs with half circles 12 px across', () => {
    // Arrange
    const inbound = NORTH;

    // Act
    const { outline } = racetrack(inbound, 'R');

    // Assert
    const xs = outline.points.map((p) => p.x);
    const ys = outline.points.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(12);
    expect(Math.min(...ys)).toBeCloseTo(-6);
    expect(Math.max(...ys)).toBeCloseTo(24);
    const turnCentre = { x: 6, y: 0 };
    const roundTheFix = outline.points.filter((p) => p.y < 0);
    expect(roundTheFix.length).toBeGreaterThan(2);
    for (const p of roundTheFix) expect(dist(p, turnCentre)).toBeCloseTo(6);
  });

  it('puts each chevron tip at its leg midpoint, inbound toward the fix and outbound away', () => {
    // Arrange
    const inbound = EAST;

    // Act
    const { chevrons } = racetrack(inbound, 'R');

    // Assert
    const [onInbound, onOutbound] = chevrons;
    expect(at(onInbound.points, 1)).toEqual({ x: -9, y: 0 });
    expect(at(onOutbound.points, 1).x).toBeCloseTo(-9);
    expect(at(onOutbound.points, 1).y).toBeCloseTo(12);
    expect(mid(at(onInbound.points, 0), at(onInbound.points, 2)).x).toBeCloseTo(-14);
    expect(mid(at(onOutbound.points, 0), at(onOutbound.points, 2)).x).toBeCloseTo(-4);
    expect(dist(at(onInbound.points, 0), at(onInbound.points, 2))).toBeCloseTo(6);
  });

  it('strokes the outline 1 px and each chevron 1.2 px, solid and open', () => {
    // Arrange
    const inbound = NORTH;

    // Act
    const { outline, chevrons } = racetrack(inbound, 'L');

    // Assert
    expect([outline.width, outline.closed]).toEqual([1, true]);
    expect(chevrons.map((c) => [c.width, c.closed])).toEqual([
      [1.2, false],
      [1.2, false],
    ]);
  });
});

describe('inboundTrack', () => {
  it('takes inboundTrue without reading the declination', () => {
    // Arrange
    const hold = { inboundTrue: 198, inboundMag: 205 };

    // Act
    const track = inboundTrack(hold, never);

    // Assert
    expect(track).toBe(198);
  });

  it('takes inboundMag turned to true by the declination at the fix', () => {
    // Arrange
    const hold = { inboundMag: 25 };

    // Act
    const track = inboundTrack(hold, () => -7);

    // Assert
    expect(track).toBeCloseTo(18);
  });
});
