import { describe, expect, it } from 'bun:test';

import type { ChartItem, ItemPart } from './chart';
import { distanceToSegment, type Vec2 } from './geo';
import { footprintOf } from './labelStacks';
import type { LonLat } from './mapdata';
import { areaPlaceOf, poleOf, ringArea } from './pole';

const ring = (...points: [number, number][]): Vec2[] => points.map(([x, y]) => ({ x, y }));

const edgesOf = (r: Vec2[]): [Vec2, Vec2][] => r.map((a, i) => [a, r[(i + 1) % r.length] ?? a]);

const distanceToEdges = (p: Vec2, rings: Vec2[][]): number =>
  Math.min(...rings.flatMap(edgesOf).map(([a, b]) => distanceToSegment(p, a, b)));

/** Even-odd inside test over every ring, so a hole is outside. */
const inside = (p: Vec2, rings: Vec2[][]): boolean =>
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

const project = (lat: number, lon: number): Vec2 => ({ x: lon, y: lat });

const square = (from: number, to: number): LonLat[] => [
  [from, from],
  [to, from],
  [to, to],
  [from, to],
  [from, from],
];

const areaPart = (...rings: LonLat[][]): ItemPart => ({
  geometry: { type: 'Polygon', coordinates: rings },
  properties: { layer: 'tma', name: 'X' },
});

const itemOf = (layer: 'tma' | 'ad', ...parts: ItemPart[]): ChartItem => ({
  key: 'K',
  layer,
  parts,
});

describe('areaPlaceOf', () => {
  it('puts the pole in the largest polygon part, whichever part comes first', () => {
    // Arrange
    const item = itemOf('tma', areaPart(square(0, 1)), areaPart(square(10, 20)));

    // Act
    const place = areaPlaceOf(item, project);

    // Assert
    expect(place?.at.x).toBeCloseTo(15, 0);
    expect(place?.at.y).toBeCloseTo(15, 0);
    expect(place?.room).toBeCloseTo(5, 0);
    expect(place?.footprint).toBe(footprintOf(square(10, 20)));
  });

  it('puts a line area at the middle of its first part, with no room or footprint', () => {
    // Arrange
    const line: ItemPart = {
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [4, 0],
        ],
      },
      properties: { layer: 'tma', name: 'X' },
    };
    const item = itemOf('tma', line);

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
    const point: ItemPart = {
      geometry: { type: 'Point', coordinates: [1, 1] },
      properties: { layer: 'ad', id: 'XQPA' },
    };
    const item = itemOf('ad', point);

    // Act
    const place = areaPlaceOf(item, project);

    // Assert
    expect(place).toBeUndefined();
  });
});
