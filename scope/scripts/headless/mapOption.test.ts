import { describe, expect, it } from 'bun:test';

import { DRAW_STACK } from '../../src/lib/layers';
import { BUILTIN_ID } from '../../src/lib/mapsetFormat';
import { benchSettings, loadMap, type MapOption, parseMapOption } from './mapOption';

/** RJTT */
const SITE = { lat: 35.5533, lon: 139.7811 };

describe('parseMapOption', () => {
  it.each<[string, MapOption]>([
    ['none', { from: 'none' }],
    ['example', { from: 'example' }],
    ['synthetic', { from: 'synthetic', scale: 1 }],
    ['synthetic=2', { from: 'synthetic', scale: 2 }],
    ['synthetic=0.5', { from: 'synthetic', scale: 0.5 }],
    ['/tmp/jcab.geojson', { from: 'file', path: '/tmp/jcab.geojson' }],
  ])('reads %s', (text, wanted) => {
    // Arrange
    const given = text;

    // Act
    const option = parseMapOption(given);

    // Assert
    expect(option).toEqual(wanted);
  });

  it.each(['synthetic=', 'synthetic=x', 'synthetic=0', 'synthetic=-1'])('refuses %s', (text) => {
    // Arrange
    const read = () => parseMapOption(text);

    // Act
    const reading = expect(read);

    // Assert
    reading.toThrow('not a scale');
  });
});

describe('loadMap', () => {
  it('loads nothing for none', () => {
    // Arrange
    const option = { from: 'none' } as const;

    // Act
    const map = loadMap(option, SITE);

    // Assert
    expect(map).toBeNull();
  });

  it('sizes the example with the chart and topology functions', () => {
    // Arrange
    const option = { from: 'example' } as const;

    // Act
    const map = loadMap(option, SITE);

    // Assert
    expect(map?.chart).toEqual({
      title: 'Example map set (fictional)',
      file: 'schema/example.mapset.geojson',
    });
    expect(map?.size).toEqual({ items: 30, areaEdges: 49, routeEdges: 7, points: 8 });
  });

  it('hands over the synthetic set as a file of its own title', () => {
    // Arrange
    const option = { from: 'synthetic', scale: 1 } as const;

    // Act
    const map = loadMap(option, SITE);

    // Assert
    expect(map?.chart.title).toBe('Synthetic national set, N = 1');
    expect(map?.size.points).toBe(1490);
    expect(map?.chart.file).toEndWith('/synthetic.mapset.geojson');
    expect(map?.searched).toBe('QAAAA');
  });

  it('reads a file by its path, and refuses one that does not parse', () => {
    // Arrange
    const option = { from: 'file', path: 'package.json' } as const;

    // Act
    const load = () => loadMap(option, SITE);

    // Assert
    expect(load).toThrow('package.json');
  });
});

describe('benchSettings', () => {
  it('stores nothing with no map and the defaults, so a plain run stays as it was', () => {
    // Arrange
    const choice = { map: false, layers: 'default', density: 'normal' } as const;

    // Act
    const settings = benchSettings(choice);

    // Assert
    expect(settings).toBeUndefined();
  });

  it('turns the built-in set off with a map, so the chart is the file alone', () => {
    // Arrange
    const choice = { map: true, layers: 'default', density: 'normal' } as const;

    // Act
    const settings = benchSettings(choice);

    // Assert
    expect(settings).toEqual({ labelDensity: 'normal', disabledSets: [BUILTIN_ID] });
  });

  it('shows every layer for all, at the density asked for', () => {
    // Arrange
    const choice = { map: true, layers: 'all', density: 'dense' } as const;

    // Act
    const settings = benchSettings(choice);

    // Assert
    expect(settings).toEqual({
      labelDensity: 'dense',
      disabledSets: [BUILTIN_ID],
      shownLayers: Object.fromEntries(DRAW_STACK.map((layer) => [layer, true])),
    });
  });
});
