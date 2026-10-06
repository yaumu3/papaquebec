import { describe, expect, it } from 'bun:test';

import { makeSample as sample } from '../../state/sampleFixture';
import type { Sample } from '../../state/track';
import type { Interval } from './span';
import {
  alignTo,
  barbMarks,
  barsOf,
  GAP_SEC,
  gapsIn,
  nearestSample,
  type Point,
  rangeOf,
  runsOf,
  unwrap,
  yOf,
} from './trace';

const gs = (s: Sample) => s.gs;
const ALL: Interval = { from: 0, to: 10_000 };

describe('runsOf', () => {
  it('joins consecutive samples that carry the reading', () => {
    // Arrange
    const samples = [sample(1, { gs: 250 }), sample(2, { gs: 251 }), sample(3, { gs: 252 })];

    // Act
    const runs = runsOf(samples, gs, ALL);

    // Assert
    expect(runs).toEqual([
      [
        { t: 1, v: 250 },
        { t: 2, v: 251 },
        { t: 3, v: 252 },
      ],
    ]);
  });

  it('breaks at a sample without the reading and at a gap longer than the limit', () => {
    // Arrange
    const samples = [
      sample(1, { gs: 250 }),
      sample(2),
      sample(3, { gs: 252 }),
      sample(3 + GAP_SEC, { gs: 253 }),
      sample(4 + 2 * GAP_SEC, { gs: 254 }),
    ];

    // Act
    const runs = runsOf(samples, gs, ALL);

    // Assert
    expect(runs).toEqual([
      [{ t: 1, v: 250 }],
      [
        { t: 3, v: 252 },
        { t: 3 + GAP_SEC, v: 253 },
      ],
      [{ t: 4 + 2 * GAP_SEC, v: 254 }],
    ]);
  });

  it('keeps the sample before and after the interval, so a trace runs off its edges', () => {
    // Arrange
    const samples = [1, 2, 3, 4, 5, 6].map((t) => sample(t, { gs: 200 + t }));

    // Act
    const runs = runsOf(samples, gs, { from: 2.5, to: 4.5 });

    // Assert
    expect(runs.flat().map((p) => p.t)).toEqual([2, 3, 4, 5]);
  });
});

describe('unwrap', () => {
  it('carries a turn through north on past 360 rather than back to zero', () => {
    // Arrange
    const runs: Point[][] = [
      [
        { t: 1, v: 350 },
        { t: 2, v: 5 },
        { t: 3, v: 20 },
      ],
      [
        { t: 5, v: 10 },
        { t: 6, v: 340 },
      ],
    ];

    // Act
    const out = unwrap(runs);

    // Assert
    expect(out.map((run) => run.map((p) => p.v))).toEqual([
      [350, 365, 380],
      [10, -20],
    ]);
  });
});

describe('alignTo', () => {
  it('moves each point by whole turns to within half a turn of the reference at its time', () => {
    // Arrange
    const reference: Point[][] = [
      [
        { t: 1, v: 350 },
        { t: 2, v: 365 },
      ],
    ];
    const runs: Point[][] = [
      [
        { t: 1, v: 340 },
        { t: 2, v: 10 },
        { t: 3, v: 15 },
      ],
    ];

    // Act
    const out = alignTo(runs, reference);

    // Assert
    expect(out.map((run) => run.map((p) => p.v))).toEqual([[340, 370, 375]]);
  });
});

describe('rangeOf', () => {
  it('spans the lowest to the highest value inside the interval over every trace', () => {
    // Arrange
    const traces: Point[][][] = [
      [
        [
          { t: 1, v: 100 },
          { t: 2, v: 300 },
        ],
      ],
      [
        [
          { t: 2, v: 50 },
          { t: 3, v: 60 },
        ],
      ],
    ];

    // Act
    const range = [rangeOf(traces, { from: 1, to: 5 }), rangeOf(traces, { from: 20, to: 30 })];

    // Assert
    expect(range).toEqual([{ lo: 50, hi: 300 }, null]);
  });
});

describe('rangeOf at the edges', () => {
  it('counts the values a trace crosses the edges of the interval with', () => {
    // Arrange
    const traces: Point[][][] = [
      [
        [
          { t: 0, v: 0 },
          { t: 10, v: 100 },
          { t: 30, v: 300 },
        ],
      ],
    ];

    // Act
    const range = rangeOf(traces, { from: 5, to: 20 });

    // Assert
    expect(range).toEqual({ lo: 50, hi: 200 });
  });

  it('ranges a trace that crosses the interval with no sample inside', () => {
    // Arrange
    const traces: Point[][][] = [
      [
        [
          { t: 0, v: 0 },
          { t: 30, v: 300 },
        ],
      ],
    ];

    // Act
    const range = rangeOf(traces, { from: 10, to: 20 });

    // Assert
    expect(range).toEqual({ lo: 100, hi: 200 });
  });
});

describe('yOf', () => {
  it('puts the highest value at the top pad, the lowest at the bottom one, a flat range midway', () => {
    // Arrange
    const range = { lo: 100, hi: 300 };

    // Act
    const ys = [
      yOf(300, range, 100, 15, 5),
      yOf(100, range, 100, 15, 5),
      yOf(7, { lo: 7, hi: 7 }, 100, 15, 5),
    ];

    // Assert
    expect(ys).toEqual([15, 95, 55]);
  });
});

describe('gapsIn', () => {
  it('finds the stretches between samples further apart than the limit, cut to the interval', () => {
    // Arrange
    const samples = [sample(100), sample(101), sample(200), sample(201), sample(300)];

    // Act
    const gaps = gapsIn(samples, { from: 150, to: 250 });

    // Assert
    expect(gaps).toEqual([
      { from: 150, to: 200 },
      { from: 201, to: 250 },
    ]);
  });
});

describe('nearestSample', () => {
  it('snaps to the sample nearest in time among those inside the interval', () => {
    // Arrange
    const samples = [sample(100), sample(110), sample(120), sample(130)];

    // Act
    const found = [
      nearestSample(samples, 114, { from: 105, to: 125 }),
      nearestSample(samples, 100, { from: 105, to: 125 }),
      nearestSample(samples, 114, { from: 140, to: 150 }),
    ];

    // Assert
    expect(found.map((s) => s?.t)).toEqual([110, 110, undefined]);
  });
});

const modes = (s: Sample) => s.navModes;

describe('barsOf', () => {
  it('runs a bar per name from its first report to the sample where it stops, in order of first report', () => {
    // Arrange
    const samples = [
      sample(1, { navModes: ['AP', 'LNAV'] }),
      sample(2, { navModes: ['AP', 'LNAV', 'VNAV'] }),
      sample(3, { navModes: ['AP', 'VNAV'] }),
      sample(4, { navModes: ['AP', 'LNAV', 'VNAV'] }),
    ];

    // Act
    const bars = barsOf(samples, modes);

    // Assert
    expect(bars).toEqual([
      { name: 'AP', on: [{ from: 1, to: 4 }] },
      {
        name: 'LNAV',
        on: [
          { from: 1, to: 2 },
          { from: 4, to: 4 },
        ],
      },
      { name: 'VNAV', on: [{ from: 2, to: 4 }] },
    ]);
  });

  it('ends a bar at a gap in the samples', () => {
    // Arrange
    const samples = [sample(1, { navModes: ['AP'] }), sample(2 + GAP_SEC, { navModes: ['AP'] })];

    // Act
    const bars = barsOf(samples, modes);

    // Assert
    expect(bars).toEqual([
      {
        name: 'AP',
        on: [
          { from: 1, to: 1 },
          { from: 2 + GAP_SEC, to: 2 + GAP_SEC },
        ],
      },
    ]);
  });
});

describe('barbMarks', () => {
  it('reads the speed to the nearest five knots as pennants, barbs and half barbs', () => {
    // Arrange
    const speeds = [2, 3, 12, 25, 48, 65, 110];

    // Act
    const marks = speeds.map(barbMarks);

    // Assert
    expect(marks).toEqual([
      [],
      ['half'],
      ['full'],
      ['full', 'full', 'half'],
      ['pennant'],
      ['pennant', 'full', 'half'],
      ['pennant', 'pennant', 'full'],
    ]);
  });
});
