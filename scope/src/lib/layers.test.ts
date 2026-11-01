import { describe, expect, it } from 'bun:test';

import { DRAW_STACK, LAYER_GROUPS, LAYER_TABLE } from './layers';

describe('the order of the layers', () => {
  it('draws in the order of the spec, front first, and lists them in the panel in the order of the spec', () => {
    // Arrange
    const stack: string[] = [
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
    const groups: [string, string[]][] = [
      ['POINTS', ['ad', 'navaid', 'fix', 'vfr']],
      ['ROUTES', ['conv', 'rnav', 'dct', 'hold']],
      ['PROCEDURES', ['sid', 'star', 'trans']],
      ['RESTRICTIONS', ['pr', 'dng', 'tra', 'adiz', 'civt']],
      ['AIRSPACE', ['ctr', 'tma', 'cta', 'advisory', 'sector', 'fir', 'asr']],
      ['BASE MAP', ['coast', 'rings']],
    ];

    // Act
    const read = {
      stack: [...DRAW_STACK] as string[],
      groups: LAYER_GROUPS.map((g): [string, string[]] => [g.title, [...g.layers]]),
      ranks: DRAW_STACK.map((layer) => LAYER_TABLE[layer].rank),
    };

    // Assert
    expect(read.stack).toEqual(stack);
    expect(read.groups).toEqual(groups);
    expect(read.ranks).toEqual(DRAW_STACK.map((_, index) => index));
  });
});
