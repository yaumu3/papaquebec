import { describe, expect, it } from 'bun:test';

import { chartOf } from '../../src/lib/chart';
import { validateMapSet } from '../../src/lib/mapset';
import { EXAMPLE } from '../../src/lib/mapsetCorpus';
import { chartSteps, timeOf } from './chartSteps';

const SITE = { lat: 33.5859, lon: 130.4508 };

function exampleSet() {
  const valid = validateMapSet(EXAMPLE);
  if (!valid.ok) throw new Error(valid.message);
  return valid.data;
}

describe('chartSteps', () => {
  it('names a step for all that a chart build does', () => {
    // Arrange
    const data = exampleSet();

    // Act
    const names = chartSteps(data, SITE, () => 0).map((step) => step.name);

    // Assert
    expect(names).toEqual([
      'merge',
      'topology',
      'drawn items',
      'drawn points',
      'area places',
      'shapes areaLines',
      'shapes routeLines',
      'shapes pointMarkers',
      'labels areaLabels',
      'labels routeLabels',
      'labels pointLabels',
      'highlight',
      'trace',
      'toggle item',
      'toggle points',
    ]);
  });

  it('runs every step on the example set', () => {
    // Arrange
    const steps = chartSteps(exampleSet(), SITE, () => 0);

    // Act
    const results = steps.map((step) => step.run());

    // Assert
    expect(results.every((result) => result !== undefined)).toBe(true);
  });

  it('reads the declination for the holds it draws', () => {
    // Arrange
    let reads = 0;
    const declination = () => {
      reads += 1;
      return 0;
    };
    const steps = chartSteps(exampleSet(), SITE, declination);

    // Act
    steps.find((step) => step.name === 'shapes routeLines')?.run();

    // Assert
    expect(reads).toBeGreaterThan(0);
  });

  it('turns the fixes off in a toggle of the point layer, and an item off in one of an item', () => {
    // Arrange
    const steps = chartSteps(exampleSet(), SITE, () => 0);
    const size = (name: string) =>
      JSON.stringify(steps.find((step) => step.name === name)?.run(), (_, value: unknown) =>
        value instanceof Float32Array ? value.length : value,
      );

    // Act
    const sizes = ['shapes pointMarkers', 'toggle points', 'shapes areaLines', 'toggle item'].map(
      size,
    );

    // Assert
    expect(sizes[1]).not.toContain(sizes[0]);
    expect(sizes[3]).not.toContain(sizes[2]);
  });
});

describe('the area places step', () => {
  it('places only the items whose layer is labelled at the density', () => {
    // Arrange
    const data = exampleSet();
    const step = chartSteps(data, SITE, () => 0).find(({ name }) => name === 'area places');
    const sectors = chartOf([data]).filter((item) => item.layer === 'sector');

    // Act
    const places = step?.run();

    // Assert
    expect(sectors.length).toBeGreaterThan(0);
    expect(places).toHaveLength(sectors.length);
  });
});

describe('timeOf', () => {
  it('runs the warm-up apart, and reports the median and max of the rest', () => {
    // Arrange
    const durations = [100, 100, 3, 1, 2];
    let at = 0;
    const clock = () => at;
    const step = {
      name: 'merge',
      run: () => {
        at += durations.shift() ?? 0;
        return null;
      },
    };

    // Act
    const time = timeOf(step, { warmups: 2, runs: 3 }, clock);

    // Assert
    expect(time).toEqual({ medianMs: 2, maxMs: 3 });
  });
});
