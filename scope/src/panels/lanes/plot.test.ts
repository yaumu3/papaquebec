import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { LAPSE_SEC } from '../../lib/reports';
import { READING_KEYS } from '../../state/plotted';
import {
  ALL,
  AROUND_LAPSE,
  makeHeardSample as heardSample,
  makeSample as sample,
} from '../../state/sampleFixture';
import type { Sample } from '../../state/track';
import {
  atTicks,
  barbPath,
  barbReach,
  GLYPH_REACH_PX,
  headingAt,
  headingGlyph,
  laneRange,
  laneTraces,
  scaleLabels,
  snapped,
} from './plot';
import { PLOTS, type PlotSpec } from './plots';

/** The metres a power of ten stands for, to six figures. */
const metres = (v: number) => Number((10 ** v).toPrecision(6));

describe('laneTraces', () => {
  it('draws the lane its own reading first, then each intent plotted in it with its dash if any, marked as one', () => {
    // Arrange
    const samples = [heardSample(1, { alt: 11000, selAlt: 12000, fmsAlt: 13000 })];

    // Act
    const traces = laneTraces(samples, ['alt', 'fmsAlt', 'selAlt'], ALL);

    // Assert
    expect(traces.map((tr) => [tr.key, tr.dash, tr.intent ?? false, tr.runs])).toEqual([
      ['alt', undefined, false, [[{ t: 1, v: 11000 }]]],
      ['fmsAlt', 'dotted', true, [[{ t: 1, v: 13000 }]]],
      ['selAlt', undefined, true, [[{ t: 1, v: 12000 }]]],
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

  it('draws nothing for a lane of gantt bars, wind barbs or heading glyphs', () => {
    // Arrange
    const samples = [
      sample(1, { navModes: ['autopilot'], windDir: 300, windSpeed: 12, track: 90, heading: 85 }),
    ];

    // Act
    const traces = [
      laneTraces(samples, ['modes'], ALL),
      laneTraces(samples, ['wind'], ALL),
      laneTraces(samples, ['trk'], ALL),
    ];

    // Assert
    expect(traces).toEqual([[], [], []]);
  });
});

describe('laneTraces with the instants each reading is heard at', () => {
  it('breaks a line where its reading went unheard, while the target kept being heard', () => {
    // Arrange
    const again = 2 + LAPSE_SEC;
    const samples = Array.from({ length: 40 }, (_, k) =>
      sample(k + 1, {
        alt: 11000,
        verticalRate: 0,
        heard: { alt: k + 1 < again ? 1 : again, verticalRate: k + 1 },
      }),
    );

    // Act
    const traces = [laneTraces(samples, ['alt'], ALL), laneTraces(samples, ['vs'], ALL)];

    // Assert
    expect(traces.map(([tr]) => tr?.runs.map((run) => run.length))).toEqual([[1, 1], [40]]);
  });

  it('breaks the bank where its replies stop', () => {
    // Arrange
    const again = 2 + LAPSE_SEC;
    const samples = Array.from({ length: 40 }, (_, k) =>
      sample(k + 1, { roll: 20, heard: { roll: k + 1 < again ? 1 : again } }),
    );

    // Act
    const [trace] = laneTraces(samples, ['roll'], ALL);

    // Assert
    expect(trace?.runs.map((run) => run.length)).toEqual([1, 1]);
  });

  it('joins every sample of a reading of the reception itself', () => {
    // Arrange
    const samples = [1, 2, 3].map((t) => sample(t, { messageRate: 4 }));

    // Act
    const traces = laneTraces(samples, ['msgs'], ALL);

    // Assert
    expect(traces.map((tr) => tr.runs.map((run) => run.length))).toEqual([[3]]);
  });
});

describe('laneTraces on the ground', () => {
  it('draws the stretch on the ground along the floor, apart from the altitudes', () => {
    // Arrange
    const samples = [
      heardSample(1, { alt: 'ground' }),
      heardSample(2, { alt: 'ground' }),
      heardSample(3, { alt: 500 }),
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

const readCourse = (s: Sample) => ({ trk: s.track, hdg: s.heading });
const has = (s: Sample) => s.heading !== undefined;

describe('atTicks', () => {
  it('reads a sample under the lapse from the tick, none exactly the lapse or more', () => {
    // Arrange
    const rows = AROUND_LAPSE.map((d) => [sample(1000 + d, { windDir: 300, windSpeed: 12 })]);
    const read = (s: (typeof rows)[number][number]) => ({
      dir: s.windDir ?? 0,
      speed: s.windSpeed ?? 0,
    });

    // Act
    const barbs = rows.map((samples) => atTicks(samples, [1000], read).length);

    // Assert
    expect(barbs).toEqual([1, 0, 0]);
  });

  type Read = { t: number; trk: number | undefined; hdg: number | undefined };

  it('prefers a sample with a heading within its reach, but never one a gap away', () => {
    // Arrange
    const headed: Read[] = [{ t: 100, trk: 92, hdg: 85 }];
    const unheaded: Read[] = [{ t: 100, trk: 90, hdg: undefined }];
    const rows: [Sample[], number, number, Read[]][] = [
      [
        [sample(1000, { track: 90 }), sample(1000 + LAPSE_SEC, { track: 92, heading: 85 })],
        1000,
        2 * LAPSE_SEC,
        [{ t: 1000, trk: 90, hdg: undefined }],
      ],
      [[sample(98, { track: 90 }), sample(110, { track: 92, heading: 85 })], 100, 15, headed],
      [[sample(98, { track: 90 }), sample(110, { track: 92, heading: 85 })], 100, 5, unheaded],
      [
        [sample(100, { track: 90 }), sample(100 + LAPSE_SEC + 5, { track: 92, heading: 85 })],
        100,
        10 * LAPSE_SEC,
        unheaded,
      ],
    ];

    // Act
    const reads = rows.map(([samples, tick, withinSec]) =>
      atTicks(samples, [tick], readCourse, { has, withinSec }),
    );

    // Assert
    expect(reads).toEqual(rows.map(([, , , expected]) => expected));
  });

  it('reads one value per tick from the sample nearest it, none when that is a gap away', () => {
    // Arrange
    const samples = [
      sample(98, { windDir: 300, windSpeed: 12 }),
      sample(150, { windDir: 310, windSpeed: 15 }),
    ];
    const ticks = [100, 150 + LAPSE_SEC + 1];

    // Act
    const barbs = atTicks(samples, ticks, (s) =>
      s.windDir === undefined || s.windSpeed === undefined
        ? undefined
        : { dir: s.windDir, speed: s.windSpeed },
    );

    // Assert
    expect(barbs).toEqual([{ t: 100, dir: 300, speed: 12 }]);
  });

  it('reads the earlier of two samples as near as the tick', () => {
    // Arrange
    const samples = [sample(100, { rssi: 1 }), sample(110, { rssi: 2 })];

    // Act
    const reads = atTicks(samples, [105], (s) => ({ rssi: s.rssi }));

    // Assert
    expect(reads).toEqual([{ t: 105, rssi: 1 }]);
  });

  it('reads nothing at a tick its reading was heard a gap away from, though a sample is near', () => {
    // Arrange
    const samples = [100, 150].map((t) =>
      sample(t, { windDir: 300, windSpeed: 12, heard: { windDir: 100, windSpeed: 100 } }),
    );
    const ticks = [100, 150];

    // Act
    const barbs = atTicks(
      samples,
      ticks,
      (s) => (s.windDir === undefined ? undefined : { dir: s.windDir }),
      undefined,
      ['windDir', 'windSpeed'],
    );

    // Assert
    expect(barbs).toEqual([{ t: 100, dir: 300 }]);
  });
});

/** The farthest any vertex of a path of M, L, l and Z lies from (x, y). */
function farthest(d: string, x: number, y: number): number {
  let [ax, ay] = [x, y];
  let most = 0;
  for (const [, cmd, a, b] of d.matchAll(/([MLl])(-?[\d.]+) (-?[\d.]+)/g)) {
    const [px, py] = [Number(a), Number(b)];
    [ax, ay] = cmd === 'l' ? [ax + px, ay + py] : [px, py];
    most = Math.max(most, Math.hypot(ax - x, ay - y));
  }
  return most;
}

describe('reach', () => {
  it('holds every barb whole, its stroke too, whatever the direction and speed', () => {
    // Arrange
    const anyDirection = fc.integer({ min: 0, max: 3599 }).map((n) => n / 10);
    const anySpeed = fc.integer({ min: 0, max: 2000 }).map((n) => n / 10);

    fc.assert(
      fc.property(anyDirection, anySpeed, (dir, speed) => {
        // Act
        const reach = farthest(barbPath(100, 50, dir, speed, 16), 100, 50);

        // Assert: half the 1.2 px stroke the barbs are drawn with on top of the farthest vertex
        expect(reach + 0.6).toBeLessThanOrEqual(barbReach(16));
      }),
    );
  });

  it('reaches past the staff with a full barb at its tip', () => {
    // Arrange
    const wind = { dir: 45, speed: 10 };

    // Act
    const reach = farthest(barbPath(100, 50, wind.dir, wind.speed, 16), 100, 50);

    // Assert
    expect(reach).toBeGreaterThan(16);
  });

  it('holds every heading glyph whole, its strokes too', () => {
    // Arrange
    const anyBearing = fc.integer({ min: 0, max: 3599 }).map((n) => n / 10);
    const anyMark = fc.record({
      trk: fc.option(anyBearing, { nil: undefined }),
      hdg: fc.option(anyBearing, { nil: undefined }),
      sel: fc.option(anyBearing, { nil: undefined }),
    });

    fc.assert(
      fc.property(anyMark, (mark) => {
        // Act
        const g = headingGlyph(100, 50, mark);

        // Assert: half the 1.8 px stroke the widest of them is drawn with
        const reach = Math.max(
          ...[g.aircraft, g.vector, g.arrow, g.tick].map((d) => (d ? farthest(d, 100, 50) : 0)),
        );
        expect(reach + 0.9).toBeLessThanOrEqual(GLYPH_REACH_PX);
      }),
    );
  });
});

/** The lanes whose scale is bounded on multiples of a step, each with its step. */
const QUANTA = READING_KEYS.flatMap((lane) => {
  const spec: PlotSpec = PLOTS[lane];
  return 'quantum' in spec && spec.quantum !== undefined ? [{ lane, quantum: spec.quantum }] : [];
});

describe('snapped', () => {
  it("bounds a lane's data by the multiples of its quantum nearest outside it, a flat trace on a step one quantum below the top", () => {
    // Arrange: bounds in hundredths of a quantum, often on a step, a whole number of them apart or flat
    const anyLane = fc.constantFrom(...QUANTA);
    const anyLow = fc.oneof(
      fc.integer({ min: -5000, max: 40_000 }),
      fc.integer({ min: -50, max: 400 }).map((steps) => steps * 100),
    );
    const anySpan = fc.oneof(
      fc.constant(0),
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 1, max: 5 }).map((steps) => steps * 100),
    );
    /** The slack of the arithmetic, in quanta. */
    const slack = 1e-6;

    fc.assert(
      fc.property(anyLane, anyLow, anySpan, ({ lane, quantum }, low, span) => {
        // Arrange
        const r = { lo: (low / 100) * quantum, hi: ((low + span) / 100) * quantum };

        // Act
        const range = snapped(r, lane);

        // Assert
        const [below, above] = [(r.lo - range.lo) / quantum, (range.hi - r.hi) / quantum];
        const steps = [range.lo / quantum, range.hi / quantum];
        expect(steps.map((n) => Math.abs(n - Math.round(n)) < slack)).toEqual([true, true]);
        expect(below).toBeGreaterThanOrEqual(-slack);
        expect(below).toBeLessThan(1 - slack);
        expect(above).toBeGreaterThanOrEqual(-slack);
        expect(above).toBeLessThan(span === 0 && low % 100 === 0 ? 1 + slack : 1 - slack);
        expect(range.hi).toBeGreaterThan(range.lo);
      }),
    );
  });

  it('snaps a bound on a log scale outward to 1, 2, 5 × 10ⁿ metres, or of nautical miles from 0.1 NM', () => {
    // Arrange
    const rows = [
      // The tracker rounds a radius up to whole metres, 0.1 NM to 186.
      { lane: 'nic', lo: 186, hi: 1112 },
      { lane: 'nacp', lo: 30, hi: 92.6 },
      { lane: 'nacp', lo: 3, hi: 555.6 },
      // On a rung, flat: up to the next rung.
      { lane: 'nacp', lo: 926, hi: 926 },
      // Between rungs, flat: out to the rungs either side, 30 m being none.
      { lane: 'nacp', lo: 30, hi: 30 },
    ] as const;

    // Act
    const ranges = rows.map(({ lane, lo, hi }) =>
      snapped({ lo: Math.log10(lo), hi: Math.log10(hi) }, lane),
    );

    // Assert
    expect(ranges.map((r) => [metres(r.lo), metres(r.hi)])).toEqual([
      [185.2, 1852],
      [20, 100],
      [2, 926],
      [926, 1852],
      [20, 50],
    ]);
  });
});

describe('laneRange', () => {
  it('spans the own reading and its intents on one scale, off the floor, snapped to the quantum', () => {
    // Arrange
    const samples = [
      heardSample(1, { alt: 'ground' }),
      heardSample(2, { alt: 35_000, selAlt: 35_100 }),
      heardSample(3, { alt: 35_020, selAlt: 35_100 }),
    ];
    const traces = laneTraces(samples, ['alt', 'selAlt'], ALL);

    // Act
    const range = laneRange(traces, 'alt', ALL);

    // Assert
    expect(range).toEqual({ lo: 35_000, hi: 36_000 });
  });
});

describe('scaleLabels', () => {
  it('labels the top and bottom of a lane as its reading reads them, bounds with their unit', () => {
    // Arrange
    const rows = [
      { lane: 'alt', r: { lo: 26_000, hi: 34_000 } },
      { lane: 'vs', r: { lo: 0, hi: 2000 } },
      { lane: 'gs', r: { lo: 430, hi: 465 } },
      { lane: 'nic', r: { lo: Math.log10(0.1 * 1852), hi: Math.log10(1852) } },
      { lane: 'nacp', r: { lo: Math.log10(20), hi: Math.log10(100) } },
      { lane: 'modes', r: { lo: 0, hi: 1 } },
      { lane: 'roll', r: { lo: -10, hi: 20 } },
    ] as const;

    // Act
    const labels = rows.map(({ lane, r }) => scaleLabels(lane, r).map((l) => l.text));

    // Assert
    expect(labels).toEqual([
      ['FL340', 'FL260'],
      ['+2000', '0'],
      ['465', '430'],
      ['<1 NM', '<0.1 NM'],
      ['<100 m', '<20 m'],
      [],
      ['R20°', 'L10°'],
    ]);
  });

  it('puts each label at the value it labels', () => {
    // Arrange
    const r = { lo: 430, hi: 465 };

    // Act
    const labels = scaleLabels('gs', r);

    // Assert
    expect(labels.map((l) => l.v)).toEqual([465, 430]);
  });
});

describe('headingAt', () => {
  it('reads each of the track, heading and selected heading only while heard within the gap of the tick', () => {
    // Arrange
    const steering = { track: 90, heading: 85, selHeading: 120, navModes: ['autopilot'] };
    const stale = 100 - LAPSE_SEC - 11;
    const rows = [
      { track: 100, heading: stale, selHeading: 100 },
      { track: 100, heading: 100, selHeading: 100 },
      { track: stale, heading: 100, selHeading: 100 },
      { track: stale, heading: stale, selHeading: 100 },
      { track: 100, heading: 100, selHeading: stale },
    ];

    // Act
    const marks = rows.map((heard) =>
      headingAt(sample(100, { ...steering, heard }), 100, 'selHdg'),
    );

    // Assert
    expect(marks).toEqual([
      { trk: 90, hdg: undefined, sel: 120 },
      { trk: 90, hdg: 85, sel: 120 },
      { trk: undefined, hdg: 85, sel: 120 },
      undefined,
      { trk: 90, hdg: 85, sel: undefined },
    ]);
  });
});
