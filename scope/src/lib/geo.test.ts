import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import {
  bearingOnScreen,
  distanceToSegment,
  flatDistanceNm,
  magneticToTrue,
  northAt,
  type ProjectFn,
  trueToMagnetic,
  turn,
  type Vec2,
  velocityNm,
  nearest,
  rankByDistance,
  splitByCircle,
} from './geo';
import { direct } from './geodesic';
import { onCircle } from './math';
import { anyBetween } from './numberFixture';

describe('trueToMagnetic', () => {
  it('subtracts east declination and wraps into 0..360', () => {
    // Arrange
    const cases: [number, number, number][] = [
      [10, 7.5, 2.5],
      [3, 7.5, 355.5],
      [355, -7.5, 2.5],
      [180, 0, 180],
    ];

    // Act
    const results = cases.map(([t, decl]) => trueToMagnetic(t, decl));

    // Assert
    results.forEach((m, i) => expect(m).toBeCloseTo(cases[i]?.[2] ?? NaN, 9));
  });
});

describe('turn', () => {
  it('is the short way round from one bearing to another, however many times round either is written', () => {
    // Arrange
    const anyBearing = fc.integer({ min: -1080, max: 1080 });

    fc.assert(
      fc.property(anyBearing, anyBearing, (from, to) => {
        // Act
        const turned = turn(from, to);

        // Assert
        expect(turned).toBeGreaterThanOrEqual(-180);
        expect(turned).toBeLessThan(180);
        expect(onCircle(from + turned, 360)).toBe(onCircle(to, 360));
      }),
    );
  });
});

describe('velocityNm', () => {
  it('splits ground speed along a true track into east and north knots', () => {
    // Arrange
    const gs = 100;
    const track = 90;

    // Act
    const v = velocityNm(gs, track);

    // Assert
    expect(v.x).toBeCloseTo(100, 9);
    expect(v.y).toBeCloseTo(0, 9);
  });
});

/** A point of the plane on whole numbers, which measure exactly. */
const anyPoint = fc.record({
  x: fc.integer({ min: -20, max: 20 }),
  y: fc.integer({ min: -20, max: 20 }),
});

describe('distanceToSegment', () => {
  it('measures to the nearest point on the segment, including its ends, and to the point a segment of no length is', () => {
    // Arrange: a segment from `a` along a direction, and a point by how far along it and to its side
    const anyDirection = anyBetween(0, 2 * Math.PI);
    const anyLength = fc.oneof(fc.constant(0), anyBetween(0.01, 50));
    const anyOffset = anyBetween(-100, 100);

    fc.assert(
      fc.property(
        anyPoint,
        anyDirection,
        anyLength,
        anyOffset,
        anyOffset,
        (a, heading, length, along, aside) => {
          // Arrange
          const u = { x: Math.cos(heading), y: Math.sin(heading) };
          const b = { x: a.x + u.x * length, y: a.y + u.y * length };
          const p = { x: a.x + u.x * along - u.y * aside, y: a.y + u.y * along + u.x * aside };
          const past = along < 0 ? -along : Math.max(0, along - length);

          // Act
          const d = [distanceToSegment(p, a, b), distanceToSegment(p, b, a)];

          // Assert
          expect(d[0]).toBeCloseTo(Math.hypot(past, aside), 9);
          expect(d[1]).toBeCloseTo(Math.hypot(past, aside), 9);
        },
      ),
    );
  });
});

/** A place within a few degrees of any other. */
const anyPlace = fc.record({ lat: anyBetween(30, 40), lon: anyBetween(135, 145) });

describe('nearest', () => {
  it('picks the item closest to the point, or null when there are none', () => {
    // Arrange
    const anyItems = fc.array(anyPlace, { maxLength: 12 });

    fc.assert(
      fc.property(anyPlace, anyItems, (here, items) => {
        // Act
        const hit = nearest(here.lat, here.lon, items);

        // Assert
        const distances = items.map((item) => flatDistanceNm(here, item));
        expect(hit && flatDistanceNm(here, hit)).toBe(
          items.length > 0 ? Math.min(...distances) : null,
        );
      }),
    );
  });
});

describe('flatDistanceNm', () => {
  it('is within 1% of the geodesic over a few nautical miles, up to a degree from the poles and across the antimeridian', () => {
    // Arrange
    const anyFrom = fc.record({
      lat: anyBetween(-89, 89),
      lon: fc.oneof(anyBetween(-180, 180), anyBetween(179.9, 180), anyBetween(-180, -179.9)),
    });
    const anyBearing = anyBetween(0, 360);
    const anyMiles = anyBetween(0.05, 5);

    fc.assert(
      fc.property(anyFrom, anyBearing, anyMiles, (from, bearing, nm) => {
        // Arrange: the geodesic runs on past 180 degrees, a position does not
        const there = direct(from, bearing, nm);
        const to = { lat: there.lat, lon: turn(0, there.lon) };

        // Act
        const ratios = [flatDistanceNm(from, to), flatDistanceNm(to, from)].map(
          (flat) => flat / nm,
        );

        // Assert
        expect(ratios.map((r) => Math.abs(r - 1) < 0.01)).toEqual([true, true]);
      }),
    );
  });
});

describe('rankByDistance', () => {
  it('orders items nearest first without touching the input', () => {
    // Arrange
    const anyItems = fc.array(anyPlace, { maxLength: 12 });

    fc.assert(
      fc.property(anyPlace, anyItems, (here, items) => {
        // Arrange
        const given = [...items];

        // Act
        const out = rankByDistance(here.lat, here.lon, items);

        // Assert
        const distances = out.map((item) => flatDistanceNm(here, item));
        expect(distances).toEqual(distances.toSorted((a, b) => a - b));
        expect(new Set(out)).toEqual(new Set(given));
        expect(out).toHaveLength(given.length);
        expect(items).toEqual(given);
      }),
    );
  });
});

/** The length of a segment. */
const lengthOf = ([a, b]: [Vec2, Vec2]) => Math.hypot(b.x - a.x, b.y - a.y);

describe('splitByCircle', () => {
  it('cuts a segment where it enters and leaves a circle, if it does', () => {
    // Arrange: a segment that is often of no length
    const anySegment = fc.oneof(
      fc.tuple(anyPoint, anyPoint),
      anyPoint.map((p) => [p, { ...p }] as const),
    );
    const anyRadius = fc.integer({ min: 1, max: 20 });

    fc.assert(
      fc.property(anySegment, anyPoint, anyRadius, ([p, q], c, r) => {
        // Act
        const { outside, inside } = splitByCircle(p, q, c, r);

        // Assert
        const pieces = [...outside, ...inside].toSorted(
          (one, other) => lengthOf([p, one[0]]) - lengthOf([p, other[0]]),
        );
        expect(pieces.map(lengthOf).reduce((sum, length) => sum + length, 0)).toBeCloseTo(
          lengthOf([p, q]),
          9,
        );
        expect(pieces.map((piece) => piece[0])).toEqual([
          p,
          ...pieces.slice(0, -1).map((piece) => piece[1]),
        ]);
        expect(pieces.at(-1)?.[1]).toEqual(q);
        expect(inside.flat().every((end) => lengthOf([c, end]) <= r + 1e-9)).toBe(true);
        expect(outside.every(([a, b]) => distanceToSegment(c, a, b) >= r - 1e-9)).toBe(true);
      }),
    );
  });
});

describe('magneticToTrue', () => {
  it('undoes trueToMagnetic, wrapping into 0..360', () => {
    // Arrange: a declination too small to tell as often as any other, which leaves a sum a hair under 0
    const anyBearing = anyBetween(-720, 720);
    const anyDeclination = fc.oneof(anyBetween(-180, 180), fc.constantFrom(1e-20, -1e-20));

    fc.assert(
      fc.property(anyBearing, anyDeclination, (bearing, declination) => {
        // Arrange
        const magnetic = trueToMagnetic(bearing, declination);

        // Act
        const back = magneticToTrue(magnetic, declination);

        // Assert
        expect(magnetic).toBeGreaterThanOrEqual(0);
        expect(magnetic).toBeLessThan(360);
        expect(back).toBeGreaterThanOrEqual(0);
        expect(back).toBeLessThan(360);
        expect(Math.abs(onCircle(back - bearing + 180, 360) - 180)).toBeLessThan(1e-9);
      }),
    );
  });
});

/** A plane turned `deg` degrees anticlockwise from x = longitude, y = latitude. */
const turnedBy =
  (deg: number): ProjectFn =>
  (lat, lon) => {
    const a = deg * (Math.PI / 180);
    return { x: lon * Math.cos(a) - lat * Math.sin(a), y: lon * Math.sin(a) + lat * Math.cos(a) };
  };

describe('northAt', () => {
  it('points to a point a short step north, as a unit vector', () => {
    // Arrange
    const planes = [0, 30, -90];

    // Act
    const norths = planes.map((deg) => northAt(turnedBy(deg), 34, 131));

    // Assert
    norths.forEach((north, i) => {
      const a = (planes[i] ?? 0) * (Math.PI / 180);
      expect(north.x).toBeCloseTo(-Math.sin(a), 9);
      expect(north.y).toBeCloseTo(Math.cos(a), 9);
    });
  });
});

describe('bearingOnScreen', () => {
  it('turns north clockwise by the bearing, y down', () => {
    // Arrange
    const north = { x: 0, y: 1 };
    const bearings = [0, 90, 180, 270];

    // Act
    const screen = bearings.map((deg) => bearingOnScreen(north, deg));

    // Assert
    const expected = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    screen.forEach((v, i) => {
      expect(v.x).toBeCloseTo(expected[i]?.[0] ?? NaN, 9);
      expect(v.y).toBeCloseTo(expected[i]?.[1] ?? NaN, 9);
    });
  });

  it('turns with the plane, east of a north turned 30 degrees anticlockwise', () => {
    // Arrange
    const north = northAt(turnedBy(30), 34, 131);

    // Act
    const east = bearingOnScreen(north, 90);

    // Assert
    expect(east.x).toBeCloseTo(Math.cos(Math.PI / 6), 9);
    expect(east.y).toBeCloseTo(-Math.sin(Math.PI / 6), 9);
  });
});
