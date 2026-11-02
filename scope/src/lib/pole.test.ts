import { describe, expect, it } from 'bun:test';

import { box, itemOf, line, partOf, point, polygon, project } from '../render/scene/chartFixture';
import { distanceToSegment, type Vec2 } from './geo';
import { footprintOf } from './labelStacks';
import { areaPlaceOf, poleOf, ringArea, type RoomAt, roomsAmong } from './pole';

const ring = (...points: [number, number][]): Vec2[] => points.map(([x, y]) => ({ x, y }));

type Rings = readonly (readonly Vec2[])[];

const edgesOf = (r: readonly Vec2[]): [Vec2, Vec2][] =>
  r.map((a, i) => [a, r[(i + 1) % r.length] ?? a]);

const distanceToEdges = (p: Vec2, rings: Rings): number =>
  Math.min(...rings.flatMap(edgesOf).map(([a, b]) => distanceToSegment(p, a, b)));

/** Even-odd inside test over every ring, so a hole is outside. */
const inside = (p: Vec2, rings: Rings): boolean =>
  rings.flatMap(edgesOf).filter(([a, b]) => {
    const crosses = a.y > p.y !== b.y > p.y;
    return crosses && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
  }).length %
    2 ===
  1;

describe('poleOf', () => {
  const square = ring([0, 0], [1, 0], [1, 1], [0, 1]);
  const el = ring([0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]);
  const outer = ring([0, 0], [10, 0], [10, 10], [0, 10]);
  const hole = ring([4, 4], [6, 4], [6, 6], [4, 6]);
  const strip = ring([0, 0], [100, 95], [100, 100], [0, 5]);

  it('finds a point inside, as far from every edge as the ring allows', () => {
    // Arrange
    const polygons: [Vec2[][], number][] = [
      [[square], 0.5],
      [[el], 0.5],
      [[outer, hole], 2],
      [[strip], 1.7],
    ];

    // Act
    const poles = polygons.map(([rings]) => poleOf(rings));

    // Assert
    poles.forEach((pole, i) => {
      const [rings, room] = polygons[i] ?? [[], 0];
      expect(pole && inside(pole.at, rings)).toBe(true);
      expect(pole?.room).toBeCloseTo(pole ? distanceToEdges(pole.at, rings) : NaN, 9);
      expect(pole?.room ?? 0).toBeGreaterThan(room * 0.95);
    });
  });

  it('puts the pole of a square at its centre', () => {
    // Arrange
    const rings = [square];

    // Act
    const pole = poleOf(rings);

    // Assert
    expect(pole?.at.x).toBeCloseTo(0.5, 1);
    expect(pole?.at.y).toBeCloseTo(0.5, 1);
  });

  it('has no pole for a ring of no area', () => {
    // Arrange
    const flat = ring([0, 0], [1, 1], [2, 2]);

    // Act
    const pole = poleOf([flat]);

    // Assert
    expect(pole).toBeUndefined();
  });
});

describe('the edge index', () => {
  /** A cog: many short edges, as a sector has, around a deep notch. */
  const cog = Array.from({ length: 240 }, (_, i): Vec2 => {
    const turn = (i * Math.PI) / 120;
    const radius = (i % 8 < 4 ? 100 : 80) * (i > 100 && i < 110 ? 0.3 : 1);
    return { x: radius * Math.cos(turn), y: radius * Math.sin(turn) };
  });
  const notch = ring([-5, -5], [5, -5], [5, 5], [-5, 5]);
  const everyEdge: RoomAt = (rings) => (p) => {
    const room = distanceToEdges(p, rings);
    return inside(p, rings) ? room : -room;
  };
  const cases: Vec2[][][] = [
    [ring([0, 0], [1, 0], [1, 1], [0, 1])],
    [ring([0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3])],
    [ring([0, 0], [10, 0], [10, 10], [0, 10]), ring([4, 4], [6, 4], [6, 6], [4, 6])],
    [ring([0, 0], [100, 95], [100, 100], [0, 5])],
    [cog],
    [cog, notch],
  ];

  it('gives the pole that measuring every edge gives', () => {
    // Arrange
    const measures = [everyEdge, roomsAmong];

    // Act
    const [plain, indexed] = measures.map((measure) =>
      cases.map((rings) => poleOf(rings, measure)),
    );

    // Assert
    expect(indexed).toEqual(plain ?? []);
  });

  it('measures the room at any point as every edge does, inside and out', () => {
    // Arrange
    const plain = everyEdge([cog, notch]);
    const indexed = roomsAmong([cog, notch]);
    const points = Array.from({ length: 900 }, (_, i) => ({
      x: -120 + (i % 30) * 8.1,
      y: -120 + Math.floor(i / 30) * 8.1,
    }));

    // Act
    const rooms = points.map(indexed);

    // Assert
    expect(rooms).toEqual(points.map(plain));
  });
});

describe('the edge index, in a box that holds the point', () => {
  it('still finds the nearest edge outside that box', () => {
    // Arrange
    const sliver = ring([0, 0], [100, 100], [99, 100]);
    const beside = ring([90, 10], [92, 10], [92, 12], [90, 12]);
    const corner = { x: 99, y: 1 };

    // Act
    const room = roomsAmong([sliver, beside])(corner);

    // Assert
    expect(room).toBeCloseTo(-distanceToEdges(corner, [beside]), 9);
  });
});

describe('ringArea', () => {
  it('is the area a ring encloses, whichever way it winds', () => {
    // Arrange
    const rings = [
      ring([0, 0], [2, 0], [2, 3], [0, 3]),
      ring([0, 3], [2, 3], [2, 0], [0, 0]),
      ring([0, 0], [1, 1], [2, 2]),
    ];

    // Act
    const areas = rings.map(ringArea);

    // Assert
    expect(areas).toEqual([6, 6, 0]);
  });
});

describe('areaPlaceOf', () => {
  it('puts the pole in the largest polygon part, whichever part comes first', () => {
    // Arrange
    const item = itemOf(
      'tma',
      partOf('tma', polygon(box(0, 1))),
      partOf('tma', polygon(box(10, 20))),
    );

    // Act
    const place = areaPlaceOf(item, project);

    // Assert
    expect(place?.at.x).toBeCloseTo(15, 0);
    expect(place?.at.y).toBeCloseTo(15, 0);
    expect(place?.room).toBeCloseTo(5, 0);
    expect(place?.footprint).toBe(footprintOf(box(10, 20)));
  });

  it('puts a line area at the middle of its first part, with no room or footprint', () => {
    // Arrange
    const item = itemOf('tma', partOf('tma', line([0, 0], [4, 0])));

    // Act
    const place = areaPlaceOf(item, project);

    // Assert
    expect(place?.at.x).toBeCloseTo(2, 3);
    expect(place?.at.y).toBeCloseTo(0, 3);
    expect(place && 'room' in place).toBe(false);
    expect(place && 'footprint' in place).toBe(false);
  });

  it('has no place for an item of points', () => {
    // Arrange
    const item = itemOf('ad', partOf('ad', point([1, 1])));

    // Act
    const place = areaPlaceOf(item, project);

    // Assert
    expect(place).toBeUndefined();
  });
});
