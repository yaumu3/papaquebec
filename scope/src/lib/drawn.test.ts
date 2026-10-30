import { describe, expect, it } from 'bun:test';

import { chartOf } from './chart';
import { drawnOf } from './drawn';
import { type MapSetData, validateMapSet } from './mapset';
import { EXAMPLE } from './mapsetCorpus';

function parsed(document: unknown): MapSetData {
  const verdict = validateMapSet(document);
  if (!verdict.ok) throw new Error(verdict.message);
  return verdict.data;
}

const adapted = (set: unknown) => drawnOf(chartOf([parsed(set)]));

const SQUARE: [number, number][] = [
  [10, 20],
  [11, 20],
  [11, 21],
  [10, 21],
  [10, 20],
];

/** A set holding one Feature. */
const setOf = (properties: Record<string, unknown>, geometry: Record<string, unknown>) => ({
  type: 'FeatureCollection',
  version: 2,
  title: 'Fixture',
  features: [{ type: 'Feature', properties, geometry }],
});

const point = (lon: number, lat: number) => ({ type: 'Point', coordinates: [lon, lat] });
const area = (properties: Record<string, unknown>, ring: number[][] = SQUARE) =>
  setOf(properties, { type: 'Polygon', coordinates: [ring] });

describe('drawnOf', () => {
  it('draws each point layer on its list, swapping [lon, lat] to lat, lon', () => {
    // Arrange
    const sets = [
      setOf({ layer: 'ad', id: 'XQPA', name: 'PAPAQ' }, point(130.5, 33.5)),
      setOf({ layer: 'ad', id: 'XQPB' }, point(130.6, 33.6)),
      setOf({ layer: 'navaid', id: 'QDG', kind: 'VORTAC' }, point(130.7, 33.7)),
      setOf({ layer: 'navaid', id: 'QIK' }, point(130.8, 33.8)),
      setOf({ layer: 'fix', id: 'TAVRO' }, point(130.9, 33.9)),
      setOf({ layer: 'vfr', id: 'CAUSEWAY', ad: 'XQPA' }, point(131, 34)),
    ];

    // Act
    const [ad, unnamedAd, navaid, plainNavaid, fix, vfr] = sets.map(adapted);

    // Assert
    expect(ad?.airports).toEqual([{ id: 'XQPA', name: 'PAPAQ', lat: 33.5, lon: 130.5 }]);
    expect(unnamedAd?.airports).toEqual([{ id: 'XQPB', name: 'XQPB', lat: 33.6, lon: 130.6 }]);
    expect(navaid?.navaids).toEqual([{ id: 'QDG', kind: 'VORTAC', lat: 33.7, lon: 130.7 }]);
    expect(plainNavaid?.navaids).toEqual([{ id: 'QIK', lat: 33.8, lon: 130.8 }]);
    expect(fix?.waypoints).toEqual([{ id: 'TAVRO', lat: 33.9, lon: 130.9 }]);
    expect(vfr?.waypoints).toEqual([{ id: 'CAUSEWAY', lat: 34, lon: 131 }]);
  });

  it('gives an area its kind and the dash its kind earns', () => {
    // Arrange
    const table = [
      { layer: 'tma', kind: undefined, expected: ['TMA', false] },
      { layer: 'ctr', kind: 'ATZ', expected: ['ATZ', false] },
      { layer: 'pr', kind: 'R', expected: ['R', true] },
      { layer: 'dng', kind: undefined, expected: ['DNG', false] },
      { layer: 'tra', kind: 'TSA', expected: ['TSA', true] },
    ];

    // Act
    const drawn = table.map(({ layer, kind }) =>
      adapted(area({ layer, name: 'ZONE', ...(kind ? { kind } : {}) })).airspace.map((a) =>
        'kind' in a ? [a.kind, a.dashed] : null,
      ),
    );

    // Assert
    expect(drawn).toEqual(table.map(({ expected }) => [expected]));
  });

  it('keeps sectors and flight information regions as sectors', () => {
    // Arrange
    const sets = [
      area({ layer: 'sector', name: 'Z55' }),
      area({ layer: 'fir', name: 'PAPAQ FIR' }),
    ];

    // Act
    const [sector, fir] = sets.map(adapted);

    // Assert
    expect([sector?.sectors.length, fir?.sectors.length, sector?.airspace.length]).toEqual([
      1, 1, 0,
    ]);
  });

  it('keeps the exterior ring only, as lat, lon', () => {
    // Arrange
    const hole = [
      [20.2, 10.2],
      [20.4, 10.2],
      [20.4, 10.4],
      [20.2, 10.2],
    ];
    const set = setOf(
      { layer: 'ctr', name: 'ZONE' },
      { type: 'Polygon', coordinates: [SQUARE, hole] },
    );

    // Act
    const [drawn] = adapted(set).airspace;

    // Assert
    expect(drawn && 'points' in drawn ? drawn.points : null).toEqual(
      SQUARE.map(([lon, lat]) => [lat, lon]),
    );
  });

  it('draws one airway per Feature of a route', () => {
    // Arrange
    const stretch = setOf(
      { layer: 'conv', name: 'A901' },
      { type: 'LineString', coordinates: SQUARE },
    );
    const split = { ...stretch, features: [...stretch.features, ...stretch.features] };

    // Act
    const layers = adapted(split);

    // Assert
    expect(layers.airways.map((r) => [r.name, r.points.length])).toEqual([
      ['A901', 5],
      ['A901', 5],
    ]);
  });

  it('leaves out what the old lists cannot hold', () => {
    // Arrange
    const sets = [
      setOf({ layer: 'ctr', name: 'ZONE' }, { type: 'LineString', coordinates: SQUARE }),
      setOf({ layer: 'hold', turn: 'R', inboundMag: 90 }, point(130, 33)),
      area({ layer: 'asr', name: 'NORTH QNH AREA' }),
    ];

    // Act
    const lists = sets.map((set) => Object.values(adapted(set)).flat().length);

    // Assert
    expect(lists).toEqual([0, 0, 0]);
  });

  it('converts published limits to feet', () => {
    // Arrange
    const limits = [
      ['SFC', 'UNL'],
      ['GND', 'FL240'],
      ['12000FT', '1500FT AGL'],
    ];

    // Act
    const feet = limits.map(([lower, upper]) => {
      const [drawn] = adapted(area({ layer: 'tma', name: 'ZONE', lower, upper })).airspace;
      return drawn && 'points' in drawn ? [drawn.lowerFt, drawn.upperFt] : null;
    });

    // Assert
    expect(feet).toEqual([
      [0, undefined],
      [0, 24000],
      [12000, 1500],
    ]);
  });

  it('draws the example: every list that the old shape holds', () => {
    // Arrange
    const set = EXAMPLE;

    // Act
    const counts = Object.entries(adapted(set)).map(([list, entries]) => [list, entries.length]);

    // Assert
    expect(counts).toEqual([
      ['waypoints', 5],
      ['navaids', 2],
      ['airways', 9],
      ['airspace', 9],
      ['sectors', 2],
      ['airports', 1],
    ]);
  });
});
