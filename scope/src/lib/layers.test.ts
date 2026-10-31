import { describe, expect, it } from 'bun:test';

import { DRAW_STACK, LAYER_GROUPS, LAYER_NAMES, type ScopeLayer } from './layers';
import { LAYERS } from './mapsetFormat';

type Group = [string, readonly ScopeLayer[]];

const NAMES: [ScopeLayer, string][] = [
  ['ad', 'AERODROMES'],
  ['navaid', 'RADIO NAVAIDS'],
  ['fix', 'SIGNIFICANT POINTS'],
  ['vfr', 'VFR POINTS'],
  ['conv', 'CONVENTIONAL'],
  ['rnav', 'RNAV'],
  ['dct', 'DIRECT ROUTES'],
  ['hold', 'EN-ROUTE HOLDING'],
  ['sid', 'SID'],
  ['star', 'STAR'],
  ['trans', 'TRANSITIONS'],
  ['pr', 'RESTRICTED AREAS'],
  ['dng', 'DANGER AREAS'],
  ['tra', 'MILITARY TRAINING'],
  ['adiz', 'ADIZ'],
  ['civt', 'CIVIL TRAINING'],
  ['ctr', 'CONTROL ZONES'],
  ['tma', 'TERMINAL AREAS'],
  ['cta', 'CONTROL AREAS'],
  ['advisory', 'ADVISORY AREAS'],
  ['sector', 'SECTORS'],
  ['fir', 'FIR'],
  ['asr', 'ALTIMETER SETTING'],
  ['coast', 'COASTLINE'],
  ['rings', 'RANGE RINGS'],
];

describe('DRAW_STACK', () => {
  it('holds every layer of the map set format, the coastline and the rings, each once', () => {
    // Arrange
    const expected: string[] = [...LAYERS, 'coast', 'rings'].toSorted();

    // Act
    const stack: string[] = [...DRAW_STACK].toSorted();

    // Assert
    expect(stack).toEqual(expected);
  });

  it('draws in the order of the spec, front first', () => {
    // Arrange
    const spec: string[] = [
      'ad',
      'navaid',
      'fix',
      'vfr',
      'sid',
      'star',
      'trans',
      'conv',
      'rnav',
      'dct',
      'hold',
      'ctr',
      'pr',
      'tma',
      'sector',
      'fir',
      'dng',
      'tra',
      'adiz',
      'cta',
      'advisory',
      'civt',
      'asr',
      'coast',
      'rings',
    ];

    // Act
    const stack: string[] = [...DRAW_STACK];

    // Assert
    expect(stack).toEqual(spec);
  });
});

describe('LAYER_GROUPS', () => {
  it('lists the six groups with their layers, in the order of the panel', () => {
    // Arrange
    const spec: Group[] = [
      ['POINTS', ['ad', 'navaid', 'fix', 'vfr']],
      ['ROUTES', ['conv', 'rnav', 'dct', 'hold']],
      ['PROCEDURES', ['sid', 'star', 'trans']],
      ['RESTRICTIONS', ['pr', 'dng', 'tra', 'adiz', 'civt']],
      ['AIRSPACE', ['ctr', 'tma', 'cta', 'advisory', 'sector', 'fir', 'asr']],
      ['BASE MAP', ['coast', 'rings']],
    ];

    // Act
    const listed = LAYER_GROUPS.map((g): Group => [g.title, g.layers]);

    // Assert
    expect(listed).toEqual(spec);
  });

  it('lists every layer of the stack once', () => {
    // Arrange
    const expected: string[] = [...DRAW_STACK].toSorted();

    // Act
    const listed: string[] = LAYER_GROUPS.flatMap((g) => g.layers).toSorted();

    // Assert
    expect(listed).toEqual(expected);
  });
});

describe('LAYER_NAMES', () => {
  it('gives each layer its display name', () => {
    // Arrange
    const layers = NAMES.map(([layer]) => layer);

    // Act
    const names = layers.map((layer) => LAYER_NAMES[layer]);

    // Assert
    expect(names).toEqual(NAMES.map(([, name]) => name));
  });
});
