import { describe, expect, it } from 'bun:test';

import { makeSample as sample } from '../../state/sampleFixture';
import { barbPath, barbsAt, laneTraces, pathOf, valueAt } from './plot';
import type { Interval } from './span';
import { GAP_SEC, type Point } from './trace';

const ALL: Interval = { from: 0, to: 10_000 };

describe('laneTraces', () => {
  it('draws the lane its own reading first, then each intent plotted in it with its dash', () => {
    // Arrange
    const samples = [sample(1, { alt: 11000, selAlt: 12000, fmsAlt: 13000 })];

    // Act
    const traces = laneTraces(samples, ['alt', 'fmsAlt', 'selAlt'], ALL);

    // Assert
    expect(traces.map((tr) => [tr.key, tr.dash, tr.runs])).toEqual([
      ['alt', undefined, [[{ t: 1, v: 11000 }]]],
      ['fmsAlt', 'dotted', [[{ t: 1, v: 13000 }]]],
      ['selAlt', 'dashed', [[{ t: 1, v: 12000 }]]],
    ]);
  });

  it('unwraps degrees and aligns an intent in the lane to them', () => {
    // Arrange
    const samples = [
      sample(1, { track: 350, selHeading: 340 }),
      sample(2, { track: 5, selHeading: 10 }),
    ];

    // Act
    const traces = laneTraces(samples, ['trk', 'selHdg'], ALL);

    // Assert
    expect(traces.map((tr) => tr.runs.flat().map((p) => p.v))).toEqual([
      [350, 365],
      [340, 370],
    ]);
  });

  it('draws both lines of a pair, the second dashed', () => {
    // Arrange
    const samples = [sample(1, { seen: 1, seenPos: 5 })];

    // Act
    const traces = laneTraces(samples, ['age'], ALL);

    // Assert
    expect(traces.map((tr) => [tr.dash, tr.runs.flat().map((p) => p.v)])).toEqual([
      [undefined, [1]],
      ['dashed', [5]],
    ]);
  });
});

describe('pathOf', () => {
  it('starts each run afresh and joins the points within one', () => {
    // Arrange
    const runs: Point[][] = [
      [
        { t: 0, v: 1 },
        { t: 5, v: 2 },
      ],
      [{ t: 8, v: 3 }],
    ];

    // Act
    const d = pathOf(
      runs,
      (t) => t * 2,
      (v) => v * 10,
    );

    // Assert
    expect(d).toBe('M0.0 10.0 L10.0 20.0 M16.0 30.0');
  });
});

describe('laneTraces', () => {
  it('draws nothing for a lane of gantt bars or wind barbs', () => {
    // Arrange
    const samples = [sample(1, { navModes: ['autopilot'], windDir: 300, windSpeed: 12 })];

    // Act
    const traces = [laneTraces(samples, ['modes'], ALL), laneTraces(samples, ['wind'], ALL)];

    // Assert
    expect(traces).toEqual([[], []]);
  });
});

describe('laneTraces on the ground', () => {
  it('draws the stretch on the ground along the floor, apart from the altitudes', () => {
    // Arrange
    const samples = [
      sample(1, { alt: 'ground' }),
      sample(2, { alt: 'ground' }),
      sample(3, { alt: 500 }),
    ];

    // Act
    const traces = laneTraces(samples, ['alt'], ALL);

    // Assert
    expect(traces.map((tr) => [tr.floor ?? false, tr.runs.flat().map((p) => p.t)])).toEqual([
      [false, [3]],
      [true, [1, 2]],
    ]);
  });
});

describe('valueAt', () => {
  it('reads the value of a trace at a sample time, undefined where it has none', () => {
    // Arrange
    const runs: Point[][] = [[{ t: 1, v: 250 }], [{ t: 3, v: 252 }]];

    // Act
    const values = [valueAt(runs, 3), valueAt(runs, 2)];

    // Assert
    expect(values).toEqual([252, undefined]);
  });
});

describe('barbsAt', () => {
  it('reads one wind per tick from the sample nearest it, none when that is a gap away', () => {
    // Arrange
    const samples = [
      sample(98, { windDir: 300, windSpeed: 12 }),
      sample(150, { windDir: 310, windSpeed: 15 }),
    ];
    const ticks = [100, 150 + GAP_SEC + 1];

    // Act
    const barbs = barbsAt(samples, ticks, (s) =>
      s.windDir === undefined || s.windSpeed === undefined
        ? undefined
        : { dir: s.windDir, speed: s.windSpeed },
    );

    // Assert
    expect(barbs).toEqual([{ t: 100, dir: 300, speed: 12 }]);
  });
});

describe('barbPath', () => {
  it('draws a circle for calm, else a staff toward where the wind comes from with its marks', () => {
    // Arrange
    const calm = barbPath(10, 20, 0, 1, 16);

    // Act
    const north = barbPath(10, 20, 0, 15, 16);

    // Assert
    expect(calm.startsWith('M')).toBe(true);
    expect(calm).toContain('a');
    expect(north.startsWith('M10.0 20.0 L10.0 4.0 ')).toBe(true);
    expect(north.match(/l/g)).toHaveLength(2);
  });
});
