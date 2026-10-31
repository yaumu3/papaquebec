import { describe, expect, it } from 'bun:test';

import { chartOf, isUpperStratum, type ItemPart, outlinesOf } from './chart';
import { direct } from './geodesic';
import { type MapSetData, validateMapSet } from './mapset';
import { EXAMPLE, EXAMPLE_LAYERS, feature, variant } from './mapsetCorpus';

function parsed(document: unknown): MapSetData {
  const verdict = validateMapSet(document);
  if (!verdict.ok) throw new Error(verdict.message);
  return verdict.data;
}

const example = parsed(EXAMPLE);

/** The second parts of A901, of the PAPAQ TMA and of Z55: Features that join an earlier item. */
const JOINING = new Set([12, 18, 20]);

const itemsOf = (layer: string, name: string) =>
  chartOf([example]).filter(
    (item) =>
      item.layer === layer &&
      item.parts.some((p) => 'name' in p.properties && p.properties.name === name),
  );

/** The example with a copy of its first hold, `by` degrees of longitude away. */
const withNudgedHold = (by: number) =>
  parsed(
    variant((c) => {
      const first = feature(c, 'hold');
      const at = first.geometry.coordinates;
      if (!Array.isArray(at)) return;
      const copy = structuredClone(first);
      copy.geometry.coordinates = [Number(at[0]) + by, at[1]];
      c.features.push(copy);
    }),
  );

describe('chartOf', () => {
  it('joins the Features of one layer and name into an item with a part each', () => {
    // Arrange
    const joined = [
      ['tma', 'PAPAQ'],
      ['sector', 'Z55'],
      ['conv', 'A901'],
    ] as const;

    // Act
    const partCounts = joined.map(([layer, name]) =>
      itemsOf(layer, name).map((i) => i.parts.length),
    );

    // Assert
    expect(partCounts).toEqual([[2], [2], [2]]);
  });

  it('keeps the limits of each part of a stepped area', () => {
    // Arrange
    const [stepped] = itemsOf('tma', 'PAPAQ');

    // Act
    const uppers = stepped?.parts.map((p) => ('upper' in p.properties ? p.properties.upper : null));

    // Assert
    expect(uppers).toEqual(['FL240', 'FL160']);
  });

  it('keeps apart items that share a name across layers', () => {
    // Arrange
    const named = [...itemsOf('ctr', 'PAPAQ'), ...itemsOf('tma', 'PAPAQ')];

    // Act
    const keys = named.map((item) => item.key);

    // Assert
    expect([keys.length, new Set(keys).size]).toEqual([2, 2]);
  });

  it('tells VFR points of one id apart by their aerodrome, and holds by their pattern', () => {
    // Arrange
    const chart = chartOf([example]);

    // Act
    const counts = ['vfr', 'hold'].map((layer) => chart.filter((i) => i.layer === layer).length);

    // Assert
    expect(counts).toEqual([2, 2]);
  });

  it('keys a hold by its position rounded to a 1e-5 degree grid', () => {
    // Arrange
    const sets = [0.000004, 0.00002].map(withNudgedHold);

    // Act
    const counts = sets.map((set) => chartOf([set]).filter((i) => i.layer === 'hold').length);

    // Assert
    expect(counts).toEqual([2, 3]);
  });

  it('lists items in the order they first appear', () => {
    // Arrange
    const expected = EXAMPLE_LAYERS.filter((_, i) => !JOINING.has(i));

    // Act
    const layers = chartOf([example]).map((item): string => item.layer);

    // Assert
    expect(layers).toEqual(expected);
  });
});

type Position = [number, number];

const HERE = { lat: 35.5, lon: 139.8 };
/** A position `nm` nautical miles east of `HERE`, as a GeoJSON position. */
const eastOf = (nm: number): Position => {
  const { lat, lon } = direct(HERE, 90, nm);
  return [lon, lat];
};
const RING: Position[] = [
  [139.8, 35.5],
  [139.9, 35.5],
  [139.9, 35.6],
  [139.8, 35.5],
];

const feat = (properties: object, geometry: object) => ({ type: 'Feature', properties, geometry });
const areaFeature = (name: string, kind: string, ring: Position[] = RING) =>
  feat({ layer: 'tma', name, kind }, { type: 'Polygon', coordinates: [ring] });
const routeFeature = (name: string, kind: string) =>
  feat({ layer: 'conv', name, kind }, { type: 'LineString', coordinates: [eastOf(0), eastOf(5)] });
const pointFeature = (layer: string, id: string, kind: string, at: Position, ad?: string) =>
  feat({ layer, id, kind, ...(ad ? { ad } : {}) }, { type: 'Point', coordinates: at });
const holdFeature = (turn: string, kind: string, inbound: object = { inboundMag: 90 }) =>
  feat({ layer: 'hold', turn, kind, ...inbound }, { type: 'Point', coordinates: eastOf(0) });
const setWith = (id: string, features: object[]) =>
  parsed({ type: 'FeatureCollection', version: 2, id, title: id, features });

/** Each item as its layer and the kinds of its parts. */
type Kept = [string, (string | undefined)[]][];
const kindsOf = (sets: MapSetData[]): Kept =>
  chartOf(sets).map((item) => [item.layer, item.parts.map((p) => p.properties.kind)]);

describe('chartOf across sets', () => {
  const near = eastOf(0.5);
  const far = eastOf(2);
  const rows: [string, object[], object[], Kept][] = [
    [
      "an area of the same name: the first set's item whole, parts unmixed",
      [areaFeature('X', 'A'), areaFeature('X', 'A2', RING.toReversed())],
      [areaFeature('X', 'B')],
      [['tma', ['A', 'A2']]],
    ],
    [
      'a route of the same name',
      [routeFeature('V9', 'A')],
      [routeFeature('V9', 'B')],
      [['conv', ['A']]],
    ],
    [
      'a navaid within 1 NM',
      [pointFeature('navaid', 'QDG', 'A', eastOf(0))],
      [pointFeature('navaid', 'QDG', 'B', near)],
      [['navaid', ['A']]],
    ],
    [
      'a navaid of the same id 2 NM away is another navaid',
      [pointFeature('navaid', 'QDG', 'A', eastOf(0))],
      [pointFeature('navaid', 'QDG', 'B', far)],
      [
        ['navaid', ['A']],
        ['navaid', ['B']],
      ],
    ],
    [
      'a fix within 1 NM, and one 2 NM away',
      [pointFeature('fix', 'TAVRO', 'A', eastOf(0)), pointFeature('fix', 'NIMBA', 'A', eastOf(0))],
      [pointFeature('fix', 'TAVRO', 'B', near), pointFeature('fix', 'NIMBA', 'B', far)],
      [
        ['fix', ['A']],
        ['fix', ['A']],
        ['fix', ['B']],
      ],
    ],
    [
      'an aerodrome within 1 NM',
      [pointFeature('ad', 'QAAA', 'A', eastOf(0))],
      [pointFeature('ad', 'QAAA', 'B', near)],
      [['ad', ['A']]],
    ],
    [
      'a fix and a navaid of one id are two things',
      [pointFeature('fix', 'QDG', 'A', eastOf(0))],
      [pointFeature('navaid', 'QDG', 'B', eastOf(0))],
      [
        ['fix', ['A']],
        ['navaid', ['B']],
      ],
    ],
    [
      'a VFR point of the same id and aerodrome within 1 NM',
      [pointFeature('vfr', 'CAUSE', 'A', eastOf(0), 'QAAA')],
      [pointFeature('vfr', 'CAUSE', 'B', near, 'QAAA')],
      [['vfr', ['A']]],
    ],
    [
      'a VFR point of the same id at another aerodrome, and one of the same aerodrome 2 NM away',
      [pointFeature('vfr', 'CAUSE', 'A', eastOf(0), 'QAAA')],
      [
        pointFeature('vfr', 'CAUSE', 'B', near, 'QBBB'),
        pointFeature('vfr', 'CAUSE', 'C', far, 'QAAA'),
      ],
      [
        ['vfr', ['A']],
        ['vfr', ['B']],
        ['vfr', ['C']],
      ],
    ],
    [
      'a VFR item of two places, matched by a later set at its second place only',
      [
        pointFeature('vfr', 'CAUSE', 'A', eastOf(0), 'QAAA'),
        pointFeature('vfr', 'CAUSE', 'A2', eastOf(10), 'QAAA'),
      ],
      [pointFeature('vfr', 'CAUSE', 'B', eastOf(10.5), 'QAAA')],
      [['vfr', ['A', 'A2']]],
    ],
    [
      'a hold of the same pattern, and one with another turn',
      [holdFeature('R', 'A')],
      [holdFeature('R', 'B'), holdFeature('L', 'C')],
      [
        ['hold', ['A']],
        ['hold', ['C']],
      ],
    ],
    [
      'a hold of another magnetic inbound, and one of another true inbound',
      [holdFeature('R', 'A')],
      [
        holdFeature('R', 'B', { inboundMag: 270 }),
        holdFeature('R', 'C', { inboundMag: 90, inboundTrue: 83 }),
      ],
      [
        ['hold', ['A']],
        ['hold', ['B']],
        ['hold', ['C']],
      ],
    ],
  ];

  it("keeps the first set's item whole and drops a matching item of a later set", () => {
    // Arrange
    const sets = rows.map(([, first, second]) => [
      setWith('first', first),
      setWith('second', second),
    ]);

    // Act
    const kept = sets.map(kindsOf);

    // Assert
    expect(kept).toEqual(rows.map(([, , , expected]) => expected));
  });

  it('takes the other item when the sets come the other way round', () => {
    // Arrange
    const sets = [
      setWith('first', [pointFeature('navaid', 'QDG', 'A', eastOf(0))]),
      setWith('second', [pointFeature('navaid', 'QDG', 'B', near)]),
    ];

    // Act
    const kept = kindsOf(sets.toReversed());

    // Assert
    expect(kept).toEqual([['navaid', ['B']]]);
  });

  it('drops a point of a third set that matches the first of two kept points of its id', () => {
    // Arrange
    const sets = [
      setWith('first', [pointFeature('navaid', 'QDG', 'A', eastOf(0))]),
      setWith('second', [pointFeature('navaid', 'QDG', 'B', far)]),
      setWith('third', [pointFeature('navaid', 'QDG', 'C', near)]),
    ];

    // Act
    const kept = kindsOf(sets);

    // Assert
    expect(kept).toEqual([
      ['navaid', ['A']],
      ['navaid', ['B']],
    ]);
  });

  it('keys an item by its layer and naming, and a point also by where it stands, never by its set', () => {
    // Arrange
    const sets = [
      setWith('alpha', [areaFeature('X', 'A'), pointFeature('navaid', 'QDG', 'A', eastOf(0))]),
      setWith('omega', [pointFeature('navaid', 'QDG', 'B', far)]),
    ];

    // Act
    const keys = chartOf(sets).map((item) => item.key);

    // Assert
    expect(new Set(keys).size).toBe(3);
    expect(keys.some((key) => key.includes('alpha') || key.includes('omega'))).toBe(false);
  });
});

const area = (lower?: string): ItemPart => ({
  geometry: { type: 'Polygon', coordinates: [] },
  properties: { layer: 'sector', name: 'X', ...(lower ? { lower } : {}) },
});

describe('isUpperStratum', () => {
  it('holds for a lower limit above the surface, and for nothing else', () => {
    // Arrange
    const rows: [string | undefined, boolean][] = [
      [undefined, false],
      ['SFC', false],
      ['GND', false],
      ['0FT', false],
      ['0FT AGL', false],
      ['FL145', true],
      ['5000FT', true],
      ['2500FT AGL', true],
      ['UNL', true],
    ];

    // Act
    const verdicts = rows.map(([lower]) => isUpperStratum(area(lower)));

    // Assert
    expect(verdicts).toEqual(rows.map(([, expected]) => expected));
  });

  it('does not hold for a part without limits, such as a point', () => {
    // Arrange
    const point: ItemPart = {
      geometry: { type: 'Point', coordinates: [139.78, 35.55] },
      properties: { layer: 'ad', id: 'QAAA' },
    };

    // Act
    const verdict = isUpperStratum(point);

    // Assert
    expect(verdict).toBe(false);
  });
});

describe('outlinesOf', () => {
  it('lists a point as one outline of one position, a line as itself, a polygon as its rings', () => {
    // Arrange
    const ring = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 0],
    ] as [number, number][];
    const hole = [
      [0.5, 0.5],
      [1, 0.5],
      [1, 1],
      [0.5, 0.5],
    ] as [number, number][];
    const line = [
      [0, 0],
      [1, 1],
    ] as [number, number][];
    const geometries: ItemPart['geometry'][] = [
      { type: 'Point', coordinates: [3, 4] },
      { type: 'LineString', coordinates: line },
      { type: 'Polygon', coordinates: [ring, hole] },
    ];

    // Act
    const outlines = geometries.map(outlinesOf);

    // Assert
    expect(outlines).toEqual([[[[3, 4]]], [line], [ring, hole]]);
  });
});
