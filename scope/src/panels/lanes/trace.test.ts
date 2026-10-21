import { describe, expect, it } from 'bun:test';

import { LAPSE_SEC } from '../../lib/reports';
import { makeSample as sample } from '../../state/sampleFixture';
import type { Sample } from '../../state/track';
import type { Interval } from '../../state/window';
import {
  barbMarks,
  barsOf,
  gapsIn,
  nearestSample,
  newestSample,
  peekAt,
  type Point,
  rangeOf,
  runsOf,
  yOf,
} from './trace';

const gs = (s: Sample) => s.gs;
const ALL: Interval = { from: 0, to: 10_000 };

describe('runsOf', () => {
  it('breaks a run between samples exactly the lapse apart, not just under it', () => {
    // Arrange
    const rows = [29.9, 30, 30.1].map((d) => [
      sample(1000, { gs: 250 }),
      sample(1000 + d, { gs: 251 }),
    ]);

    // Act
    const runs = rows.map((samples) => runsOf(samples, gs, ALL).length);

    // Assert
    expect(runs).toEqual([1, 2, 2]);
  });

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

  it('breaks at a sample without the reading and at a gap of the lapse or more', () => {
    // Arrange
    const samples = [
      sample(1, { gs: 250 }),
      sample(2),
      sample(3, { gs: 252 }),
      sample(2 + LAPSE_SEC, { gs: 253 }),
      sample(4 + 2 * LAPSE_SEC, { gs: 254 }),
    ];

    // Act
    const runs = runsOf(samples, gs, ALL);

    // Assert
    expect(runs).toEqual([
      [{ t: 1, v: 250 }],
      [
        { t: 3, v: 252 },
        { t: 2 + LAPSE_SEC, v: 253 },
      ],
      [{ t: 4 + 2 * LAPSE_SEC, v: 254 }],
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

describe('runsOf with the instants a reading is heard at', () => {
  it('breaks a run where the reading went unheard exactly the lapse, not just under it', () => {
    // Arrange
    const rows = [29.9, 30, 30.1].map((d) => [
      sample(1000, { gs: 250, heard: { gs: 1000 } }),
      sample(1001, { gs: 251, heard: { gs: 1000 + d } }),
    ]);

    // Act
    const runs = rows.map((samples) => runsOf(samples, gs, ALL, ['gs']).length);

    // Assert
    expect(runs).toEqual([1, 2, 2]);
  });

  it('takes a value repeated without a new report as no new point', () => {
    // Arrange
    const samples = [1, 1, 3, 3].map((heard, k) =>
      sample(k + 1, { gs: 250 + heard, heard: { gs: heard } }),
    );

    // Act
    const runs = runsOf(samples, gs, ALL, ['gs']);

    // Assert
    expect(runs).toEqual([
      [
        { t: 1, v: 251 },
        { t: 3, v: 253 },
      ],
    ]);
  });

  it('breaks where the reading went unheard longer than the gap, though the samples kept coming', () => {
    // Arrange
    const again = 2 + LAPSE_SEC;
    const samples = Array.from({ length: 40 }, (_, k) =>
      sample(k + 1, { gs: 250, heard: { gs: k + 1 < again ? 1 : again } }),
    );

    // Act
    const runs = runsOf(samples, gs, ALL, ['gs']);

    // Assert
    expect(runs).toEqual([[{ t: 1, v: 250 }], [{ t: again, v: 250 }]]);
  });

  it('skips a sample at the start of a stretch whose reading was heard a gap before it', () => {
    // Arrange
    const before = [0, 5, 10].map((t) => sample(t, { gs: 300, heard: { gs: t } }));
    const stale = sample(100, { gs: 300, heard: { gs: 10 } });
    const after = [101, 110].map((t) => sample(t, { gs: 200, heard: { gs: t } }));

    // Act
    const runs = runsOf([...before, stale, ...after], gs, { from: 95, to: 115 }, ['gs']);

    // Assert
    expect(runs.map((run) => run.map((p) => p.t))).toEqual([[10], [101, 110]]);
  });

  it('skips a sample whose reading was never heard', () => {
    // Arrange
    const samples = [sample(1, { gs: 250, heard: { gs: 1 } }), sample(2, { gs: 251 })];

    // Act
    const runs = runsOf(samples, gs, ALL, ['gs']);

    // Assert
    expect(runs).toEqual([[{ t: 1, v: 250 }]]);
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
  it('adds the silence after the last sample while the target is lost, cut to the interval', () => {
    // Arrange
    const samples = [sample(100), sample(101)];
    const rows = [
      { lost: true, i: { from: 0, to: 200 } },
      { lost: false, i: { from: 0, to: 200 } },
      { lost: true, i: { from: 150, to: 200 } },
      { lost: true, i: { from: 0, to: 100.5 } },
      { lost: true, i: { from: 0, to: 101 } },
    ];

    // Act
    const gaps = rows.map((r) => gapsIn(samples, r.i, r.lost));

    // Assert
    expect(gaps).toEqual([[{ from: 101, to: 200 }], [], [{ from: 150, to: 200 }], [], []]);
  });

  it('leaves a gap between samples exactly the lapse apart, not ones just under it', () => {
    // Arrange
    const spacings = [29.9, 30, 30.1];

    // Act
    const gaps = spacings.map((d) => gapsIn([sample(1000), sample(1000 + d)], ALL));

    // Assert
    expect(gaps).toEqual([[], [{ from: 1000, to: 1030 }], [{ from: 1000, to: 1030.1 }]]);
  });

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

  it("takes the earlier of two as near, the window's own ends included, none among none", () => {
    // Arrange
    const samples = [sample(100), sample(110), sample(120), sample(130)];
    const rows = [
      { from: samples, t: 115, i: { from: 100, to: 130 } },
      { from: samples, t: 90, i: { from: 100, to: 130 } },
      { from: samples, t: 140, i: { from: 100, to: 130 } },
      { from: samples, t: 125, i: { from: 111, to: 119 } },
      { from: [], t: 115, i: { from: 100, to: 130 } },
    ];

    // Act
    const found = rows.map((r) => nearestSample(r.from, r.t, r.i));

    // Assert
    expect(found.map((s) => s?.t)).toEqual([110, 100, 130, undefined, undefined]);
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
    const samples = [sample(1, { navModes: ['AP'] }), sample(2 + LAPSE_SEC, { navModes: ['AP'] })];

    // Act
    const bars = barsOf(samples, modes);

    // Assert
    expect(bars).toEqual([
      {
        name: 'AP',
        on: [
          { from: 1, to: 1 },
          { from: 2 + LAPSE_SEC, to: 2 + LAPSE_SEC },
        ],
      },
    ]);
  });

  it('ends a bar where its reading went unheard longer than the gap, though the samples kept coming', () => {
    // Arrange
    const samples = [1, 2, 2 + LAPSE_SEC, 3 + LAPSE_SEC].map((t) =>
      sample(t, { navModes: ['AP'], heard: { navModes: 1 } }),
    );

    // Act
    const bars = barsOf(samples, modes, ['navModes']);

    // Assert
    expect(bars).toEqual([{ name: 'AP', on: [{ from: 1, to: 2 }] }]);
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

describe('newestSample', () => {
  it('is the last sample inside the window, none when it holds none', () => {
    // Arrange
    const samples = [sample(100), sample(110), sample(120), sample(130)];
    const windows = [
      { from: 100, to: 130 },
      { from: 100, to: 125 },
      { from: 111, to: 119 },
    ];

    // Act
    const found = windows.map((i) => newestSample(samples, i));

    // Assert
    expect(found.map((s) => s?.t)).toEqual([130, 120, undefined]);
  });
});

describe('peekAt', () => {
  it('takes the sample nearest the time a point across the plot stands for, inside the window', () => {
    // Arrange
    const samples = [sample(100), sample(110), sample(120), sample(130)];
    const window = { from: 100, to: 130 };
    const rows = [
      { px: 0, i: window },
      { px: 140, i: window },
      { px: 300, i: window },
      { px: 140, i: { from: 110, to: 140 } },
      { px: 140, i: { from: 111, to: 119 } },
    ];

    // Act
    const found = rows.map((r) => peekAt(samples, r.px, r.i, 300, false));

    // Assert
    expect(found.map((p) => p?.sample?.t)).toEqual([100, 110, 130, 120, undefined]);
  });

  it('stands at the pointer with no sample over a gap, at the nearest one at its edges and outside', () => {
    // Arrange
    const samples = [sample(100), sample(131), sample(140)];
    const window = { from: 100, to: 140 };
    const times = [100, 100.1, 115, 130.9, 131, 135, 140];

    // Act
    const found = times.map((t) => peekAt(samples, (t - 100) * 10, window, 400, false));

    // Assert
    expect(found.map((p) => [p?.t, p?.sample?.t])).toEqual([
      [100, 100],
      [100.1, undefined],
      [115, undefined],
      [130.9, undefined],
      [131, 131],
      [131, 131],
      [140, 140],
    ]);
  });

  it('snaps to the nearest sample over a silence shorter than a gap', () => {
    // Arrange
    const samples = [sample(100), sample(129.9)];
    const window = { from: 100, to: 130 };
    const times = [110, 115];

    // Act
    const found = times.map((t) => peekAt(samples, (t - 100) * 10, window, 300, false));

    // Assert
    expect(found.map((p) => [p?.t, p?.sample?.t])).toEqual([
      [100, 100],
      [129.9, 129.9],
    ]);
  });

  it('stands at the pointer after the last sample while the target is lost, not otherwise', () => {
    // Arrange
    const samples = [sample(100), sample(110)];
    const window = { from: 100, to: 200 };
    const rows = [
      { lost: true, t: 150 },
      { lost: false, t: 150 },
      { lost: true, t: 110 },
    ];

    // Act
    const found = rows.map((r) => peekAt(samples, r.t - 100, window, 100, r.lost));

    // Assert
    expect(found.map((p) => [p?.t, p?.sample?.t])).toEqual([
      [150, undefined],
      [110, 110],
      [110, 110],
    ]);
  });

  it('has no sample exactly where gapsIn shades', () => {
    // Arrange
    const samples = [sample(100), sample(131), sample(140), sample(200)];
    const window = { from: 0, to: 300 };
    const times = [99, 100, 100.5, 115, 130.9, 131, 135, 140, 150, 199.9, 200, 250];
    const gaps = gapsIn(samples, window, true);

    // Act
    const found = times.map((t) => peekAt(samples, t, window, 300, true)?.sample === null);

    // Assert
    const shaded = times.map((t) => gaps.some((g) => t > g.from && t < g.to));
    expect(found).toEqual(shaded);
  });
});
