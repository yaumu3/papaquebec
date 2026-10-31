import { describe, expect, it } from 'bun:test';

import { chartOf, isUpperStratum, type ItemPart, outlinesOf, setIdentity } from './chart';
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

describe('setIdentity', () => {
  it('is the id when the set has one, else its title', () => {
    // Arrange
    const withId = example;
    const withoutId = parsed(
      variant((c) => {
        delete c.id;
      }),
    );

    // Act
    const identities = [withId, withoutId].map(setIdentity);

    // Assert
    expect(identities).toEqual(['example-set', example.title]);
  });
});

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

  it('gives the same set under two identities separate items', () => {
    // Arrange
    const other = parsed(
      variant((c) => {
        c.id = 'another';
      }),
    );

    const single = chartOf([example]).length;

    // Act
    const chart = chartOf([example, other]);

    // Assert
    expect([chart.length, new Set(chart.map((i) => i.key)).size]).toEqual([2 * single, 2 * single]);
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
