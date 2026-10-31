import { describe, expect, it } from 'bun:test';

import { chartOf } from '../src/lib/chart';
import { parseMapSet, validateMapSet } from '../src/lib/mapset';
import { type OpenAipInput, toMapSet, withinRadius } from './openaip';

const point = (lat: number, lon: number) => ({ type: 'Point', coordinates: [lon, lat] });
const poly = (pts: [number, number][]) => ({
  type: 'Polygon',
  coordinates: [pts.map(([lat, lon]) => [lon, lat])],
});

const site = { lat: 35.765, lon: 140.386 }; // RJAA

const FIXTURE = {
  navaids: [
    { identifier: 'NRE', name: 'NARITA', type: 4, geometry: point(35.76, 140.38) }, // RJAA
    { identifier: 'FAR', name: 'FAR AWAY', type: 3, geometry: point(43.0, 141.0) }, // Sapporo
  ],
  airports: [
    { icaoCode: 'RJAA', name: 'NARITA INTL', type: 0, geometry: point(35.765, 140.386) },
    { name: 'NO CODE', type: 0, geometry: point(35.7, 140.3) }, // near RJAA
  ],
  reportingPoints: [{ name: 'CHIBA', compulsory: true, geometry: point(35.6, 140.1) }], // Chiba
  airspaces: [
    {
      name: 'NARITA CTR',
      type: 4,
      icaoClass: 2,
      lowerLimit: { value: 0, unit: 1, referenceDatum: 0 },
      upperLimit: { value: 3000, unit: 1, referenceDatum: 1 },
      geometry: poly([
        [35.9, 140.2], // around RJAA
        [35.9, 140.6],
        [35.6, 140.6],
        [35.6, 140.2],
        [35.9, 140.2],
      ]),
    },
    {
      name: 'TOKYO FIR',
      type: 10,
      geometry: poly([
        [30, 130], // all of Japan
        [30, 150],
        [45, 150],
        [45, 130],
        [30, 130],
      ]),
    },
    {
      name: 'R-134',
      type: 1,
      geometry: poly([
        [35.5, 140.0], // Ichihara
        [35.5, 140.1],
        [35.4, 140.1],
        [35.5, 140.0],
      ]),
    },
    {
      name: 'IGNORED SPORT',
      type: 28,
      geometry: poly([
        [35.7, 140.1], // Chiba
        [35.7, 140.2],
        [35.6, 140.2],
        [35.7, 140.1],
      ]),
    },
    {
      name: 'TOKYO ACA-3',
      type: 0,
      geometry: poly([
        [35.7, 140.1], // Chiba
        [35.7, 140.2],
        [35.6, 140.2],
        [35.7, 140.1],
      ]),
    },
    {
      name: 'NARITA INFO ZONE-2',
      type: 0,
      geometry: poly([
        [35.7, 140.1], // Chiba
        [35.7, 140.2],
        [35.6, 140.2],
        [35.7, 140.1],
      ]),
    },
    {
      name: 'AKASHI HELI',
      type: 0,
      geometry: poly([
        [35.7, 140.1], // Chiba
        [35.7, 140.2],
        [35.6, 140.2],
        [35.7, 140.1],
      ]),
    },
    {
      name: 'CHOFU AP APPROACH SURFACE-S',
      type: 2,
      geometry: poly([
        [35.7, 140.1], // Chiba
        [35.7, 140.2],
        [35.6, 140.2],
        [35.7, 140.1],
      ]),
    },
  ],
};

describe('withinRadius', () => {
  it('keeps points inside the radius and drops the rest', () => {
    // Arrange
    const near: [number, number] = [35.7, 140.1]; // Chiba
    const far: [number, number] = [43.0, 141.0]; // Sapporo

    // Act
    const out = [near, far].map(([lat, lon]) => withinRadius(site, 300, lat, lon));

    // Assert
    expect(out).toEqual([true, false]);
  });
});

const AREA = { site, radiusNm: 300, countries: ['JP'], fetched: '2026-10-30' };

/** An airspace record of the given type and name around the site, with the given limits. */
const airspace = (
  type: number,
  name: string,
  limits: { lowerLimit?: unknown; upperLimit?: unknown } = {},
) => ({
  name,
  type,
  ...limits,
  geometry: poly([
    [35.7, 140.1],
    [35.7, 140.2],
    [35.6, 140.2],
    [35.7, 140.1],
  ]),
});

const inputOf = (parts: Partial<OpenAipInput>): OpenAipInput => ({
  navaids: [],
  airports: [],
  reportingPoints: [],
  airspaces: [],
  ...parts,
});

describe('toMapSet', () => {
  it('files each feature under its layer, with its kind and limits', () => {
    // Arrange
    const expected = [
      ['navaid', 'VOR/DME', 'NRE', undefined, undefined],
      ['ad', undefined, 'RJAA', undefined, undefined],
      ['vfr', undefined, 'CHIBA', undefined, undefined],
      ['ctr', 'CTR', 'NARITA CTR', 'SFC', '3000FT'],
      ['fir', undefined, 'TOKYO FIR', undefined, undefined],
      ['pr', 'R', 'R-134', undefined, undefined],
      ['tma', 'ACA', 'TOKYO ACA-3', undefined, undefined],
      ['ctr', 'INFO', 'NARITA INFO ZONE-2', undefined, undefined],
    ];

    // Act
    const chart = chartOf([parseMapSet(toMapSet(FIXTURE, AREA))]);

    // Assert
    const filed = chart.map(({ layer, parts: [part] }) => {
      const p: Record<string, unknown> = part?.properties ?? {};
      return [layer, p.kind, p.id ?? p.name, p.lower, p.upper];
    });
    expect(filed).toEqual(expected);
  });

  it('produces a set that passes the strict parse', () => {
    // Arrange
    const set = toMapSet(FIXTURE, AREA);

    // Act
    const verdict = validateMapSet(set);

    // Assert
    expect(verdict.ok).toBe(true);
  });

  it('names the set as the built-in one, with no effective date', () => {
    // Arrange
    const area = { ...AREA, countries: ['JP', 'KR'] };

    // Act
    const set = toMapSet(inputOf({}), area);

    // Assert
    expect(set).toEqual({
      type: 'FeatureCollection',
      version: 2,
      id: 'openaip',
      title: 'openAIP JP KR 2026-10-30',
      note: expect.stringContaining('CC BY-NC-SA 4.0'),
      features: [],
    });
  });

  it('files each airspace type, or its name when the type is Other, under a layer and kind', () => {
    // Arrange
    const table: [number, string, string | undefined, string | undefined][] = [
      [1, 'ZONE', 'pr', 'R'],
      [2, 'ZONE', 'dng', 'D'],
      [3, 'ZONE', 'pr', 'P'],
      [4, 'ZONE', 'ctr', 'CTR'],
      [5, 'ZONE', 'advisory', 'TMZ'],
      [6, 'ZONE', 'advisory', 'RMZ'],
      [7, 'ZONE', 'tma', 'TMA'],
      [8, 'ZONE', 'tra', 'TRA'],
      [9, 'ZONE', 'tra', 'TSA'],
      [13, 'ZONE', 'ctr', 'ATZ'],
      [17, 'ZONE', 'dng', 'ALERT'],
      [18, 'ZONE', 'dng', 'WARNING'],
      [23, 'ZONE', 'ctr', 'TIZ'],
      [24, 'ZONE', 'ctr', 'TIA'],
      [25, 'ZONE', 'tra', 'MTA'],
      [26, 'ZONE', 'cta', 'CTA'],
      [10, 'ZONE', 'fir', undefined],
      [27, 'ZONE', 'sector', undefined],
      [0, 'QUEBEC TCA', 'advisory', 'TCA'],
      [0, 'QUEBEC ACA-1', 'tma', 'ACA'],
      [0, 'QUEBEC PCA', 'cta', 'PCA'],
      [0, 'QUEBEC INFO ZONE-2', 'ctr', 'INFO'],
      [0, 'QUEBEC TCA HORIZONTAL SURFACE', undefined, undefined],
    ];

    // Act
    const filed = table.map(([type, name]) => {
      const [feature] = toMapSet(inputOf({ airspaces: [airspace(type, name)] }), AREA).features;
      const p = feature?.properties;
      return p && 'kind' in p ? [p.layer, p.kind] : [p?.layer, undefined];
    });

    // Assert
    expect(filed).toEqual(table.map(([, , layer, kind]) => [layer, kind]));
  });

  it('spells each navaid type as the format lists it, folding the DVOR variants', () => {
    // Arrange
    const kinds = ['DME', 'TACAN', 'NDB', 'VOR', 'VOR/DME', 'VORTAC', 'VOR', 'VOR/DME', 'VORTAC'];

    // Act
    const filed = kinds.map((_, type) => {
      const navaids = [{ identifier: 'QAA', type, geometry: point(35.76, 140.38) }];
      const [feature] = toMapSet(inputOf({ navaids }), AREA).features;
      return feature && 'kind' in feature.properties ? feature.properties.kind : undefined;
    });

    // Assert
    expect(filed).toEqual(kinds);
  });

  it('writes openAIP limits as published strings', () => {
    // Arrange
    const table: [{ value: number; unit: number; referenceDatum: number }, string | undefined][] = [
      [{ value: 3000, unit: 1, referenceDatum: 1 }, '3000FT'],
      [{ value: 600, unit: 0, referenceDatum: 1 }, '1969FT'],
      [{ value: 0, unit: 1, referenceDatum: 0 }, 'SFC'],
      [{ value: 1500, unit: 1, referenceDatum: 0 }, '1500FT AGL'],
      [{ value: 145, unit: 6, referenceDatum: 2 }, 'FL145'],
      [{ value: 5, unit: 6, referenceDatum: 2 }, 'FL05'],
      [{ value: 999, unit: 6, referenceDatum: 2 }, 'UNL'],
      [{ value: 3, unit: 9, referenceDatum: 1 }, undefined],
    ];

    // Act
    const written = table.map(([upperLimit]) => {
      const [feature] = toMapSet(
        inputOf({ airspaces: [airspace(7, 'ZONE', { upperLimit })] }),
        AREA,
      ).features;
      return feature && 'upper' in feature.properties ? feature.properties.upper : undefined;
    });

    // Assert
    expect(written).toEqual(table.map(([, limit]) => limit));
  });

  it('truncates a long name to 64 characters and a long id to 32', () => {
    // Arrange
    const input = inputOf({
      airspaces: [airspace(7, 'Q'.repeat(70))],
      airports: [
        { icaoCode: 'X'.repeat(40), name: 'A'.repeat(70), type: 0, geometry: point(35.7, 140.3) },
      ],
    });

    // Act
    const features = toMapSet(input, AREA).features;

    // Assert
    expect(
      features.map((f) => [
        'id' in f.properties ? f.properties.id.length : null,
        'name' in f.properties ? f.properties.name?.length : null,
      ]),
    ).toEqual([
      [32, 64],
      [null, 64],
    ]);
  });

  it('keeps the first of a repeated point id and warns once', () => {
    // Arrange
    const warnings: string[] = [];
    const input = inputOf({
      navaids: [{ identifier: 'QAA', type: 3, geometry: point(35.76, 140.38) }],
      airports: [{ icaoCode: 'QAA', name: 'OTHER', type: 0, geometry: point(35.7, 140.3) }],
    });

    // Act
    const features = toMapSet(input, AREA, (message) => warnings.push(message)).features;

    // Assert
    expect([features.map((f) => f.properties.layer), warnings.length]).toEqual([['navaid'], 1]);
  });
});
