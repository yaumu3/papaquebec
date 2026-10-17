import { describe, expect, it } from 'bun:test';

import { makeHeardSample as heardSample, makeSample as sample } from '../../state/sampleFixture';
import {
  atTicks,
  barbPath,
  barbReach,
  GLYPH_REACH_PX,
  headingGlyph,
  laneRange,
  laneTraces,
  pathOf,
  snapped,
  valueAt,
} from './plot';
import type { Interval } from './span';
import { GAP_SEC, type Point, type Range } from './trace';

const ALL: Interval = { from: 0, to: 10_000 };

/** The metres a power of ten stands for, to six figures. */
const metres = (v: number) => Number((10 ** v).toPrecision(6));
/** A range as flat as one value. */
const flat = (v: number): Range => ({ lo: v, hi: v });

describe('laneTraces', () => {
  it('draws the lane its own reading first, then each intent plotted in it with its dash, marked as one', () => {
    // Arrange
    const samples = [heardSample(1, { alt: 11000, selAlt: 12000, fmsAlt: 13000 })];

    // Act
    const traces = laneTraces(samples, ['alt', 'fmsAlt', 'selAlt'], ALL);

    // Assert
    expect(traces.map((tr) => [tr.key, tr.dash, tr.intent ?? false, tr.runs])).toEqual([
      ['alt', undefined, false, [[{ t: 1, v: 11000 }]]],
      ['fmsAlt', 'dotted', true, [[{ t: 1, v: 13000 }]]],
      ['selAlt', 'dashed', true, [[{ t: 1, v: 12000 }]]],
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

describe('headingGlyph', () => {
  it('points the aircraft along the heading and the vector along the track, north up', () => {
    // Arrange
    const heading = { trk: 180, hdg: 90 };

    // Act
    const glyph = headingGlyph(100, 50, heading);

    // Assert: the fuselage runs nose east to tail west, the vector due south
    expect(glyph.aircraft?.startsWith('M111.0 50.0 L89.0 50.0 ')).toBe(true);
    expect(glyph.vector).toBe('M100.0 50.0 L100.0 69.0');
    expect(glyph.arrow).toBeUndefined();
  });

  it('draws the track alone as an arrow centred on the point when the heading is unknown', () => {
    // Arrange
    const heading = { trk: 0, hdg: undefined };

    // Act
    const glyph = headingGlyph(100, 50, heading);

    // Assert
    expect(glyph.arrow).toBe('M100.0 63.0 L100.0 42.0 M100.0 37.0 L96.8 42.0 L103.2 42.0 Z');
    expect([glyph.aircraft, glyph.vector]).toEqual([undefined, undefined]);
  });

  it('draws the aircraft alone when the track is unknown', () => {
    // Arrange
    const heading = { trk: undefined, hdg: 0 };

    // Act
    const glyph = headingGlyph(100, 50, heading);

    // Assert
    expect(glyph.aircraft?.startsWith('M100.0 39.0 L100.0 61.0 ')).toBe(true);
    expect([glyph.vector, glyph.arrow]).toEqual([undefined, undefined]);
  });
});

describe('headingGlyph with a selected heading', () => {
  it('arcs from the nose round to the selected heading, the way the turn goes', () => {
    // Arrange
    const turns = [
      { trk: 90, hdg: 90, sel: 180 },
      { trk: 90, hdg: 90, sel: 0 },
    ];

    // Act
    const arcs = turns.map((h) => headingGlyph(100, 50, h).toGo);

    // Assert: right round the south to 180, left round the north to 360
    expect(arcs).toEqual([
      'M113.5 50.0 A13.5 13.5 0 0 1 100.0 63.5',
      'M113.5 50.0 A13.5 13.5 0 0 0 100.0 36.5',
    ]);
  });

  it('puts a dot ahead of the nose instead once the heading holds the selection', () => {
    // Arrange
    const heading = { trk: 175, hdg: 180, sel: 180.5 };

    // Act
    const glyph = headingGlyph(100, 50, heading);

    // Assert
    expect(glyph.held).toEqual({ cx: 100, cy: 64, r: 2.2 });
    expect(glyph.toGo).toBeUndefined();
  });

  it('marks the selection past the arrow head when the heading is unknown, with nothing held', () => {
    // Arrange
    const heading = { trk: 2, hdg: undefined, sel: 0 };

    // Act
    const glyph = headingGlyph(100, 50, heading);

    // Assert
    expect(glyph.tick).toBe('M100.0 34.0 L100.0 30.5');
    expect([glyph.toGo, glyph.held]).toEqual([undefined, undefined]);
  });
});

describe('laneTraces with the instants each reading is heard at', () => {
  it('breaks a line where its reading went unheard, while the target kept being heard', () => {
    // Arrange
    const again = 2 + GAP_SEC;
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

describe('atTicks', () => {
  it('reads one value per tick from the sample nearest it, none when that is a gap away', () => {
    // Arrange
    const samples = [
      sample(98, { windDir: 300, windSpeed: 12 }),
      sample(150, { windDir: 310, windSpeed: 15 }),
    ];
    const ticks = [100, 150 + GAP_SEC + 1];

    // Act
    const barbs = atTicks(samples, ticks, (s) =>
      s.windDir === undefined || s.windSpeed === undefined
        ? undefined
        : { dir: s.windDir, speed: s.windSpeed },
    );

    // Assert
    expect(barbs).toEqual([{ t: 100, dir: 300, speed: 12 }]);
  });

  it('reads a sample the preference holds for instead, while one lies within its reach', () => {
    // Arrange
    const samples = [sample(98, { track: 90 }), sample(110, { track: 92, heading: 85 })];
    const read = (s: (typeof samples)[number]) => ({ trk: s.track, hdg: s.heading });
    const has = (s: (typeof samples)[number]) => s.heading !== undefined;

    // Act
    const reads = [15, 5].map((withinSec) => atTicks(samples, [100], read, { has, withinSec }));

    // Assert: the one with a heading ten seconds off, else the nearest
    expect(reads).toEqual([[{ t: 100, trk: 92, hdg: 85 }], [{ t: 100, trk: 90, hdg: undefined }]]);
  });

  it('reads the nearest instead of a preferred sample a gap away, however far the reach', () => {
    // Arrange
    const samples = [
      sample(100, { track: 90 }),
      sample(100 + GAP_SEC + 5, { track: 92, heading: 85 }),
    ];
    const read = (s: (typeof samples)[number]) => ({ trk: s.track, hdg: s.heading });
    const has = (s: (typeof samples)[number]) => s.heading !== undefined;

    // Act
    const reads = atTicks(samples, [100], read, { has, withinSec: 10 * GAP_SEC });

    // Assert
    expect(reads).toEqual([{ t: 100, trk: 90, hdg: undefined }]);
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
    const winds = [0, 30, 45, 60, 135, 225, 300].flatMap((dir) =>
      [5, 10, 15, 50, 65, 100].map((speed) => ({ dir, speed })),
    );

    // Act
    const reaches = winds.map((w) => farthest(barbPath(100, 50, w.dir, w.speed, 16), 100, 50));

    // Assert: half the 1.2 px stroke the barbs are drawn with on top of the farthest vertex
    expect(Math.max(...reaches) + 0.6).toBeLessThanOrEqual(barbReach(16));
    expect(Math.max(...reaches)).toBeGreaterThan(16);
  });

  it('holds every heading glyph whole, its strokes too', () => {
    // Arrange
    const marks = [0, 45, 100, 200, 315].flatMap((deg) => [
      { trk: deg, hdg: deg + 10, sel: deg + 90 },
      { trk: deg, hdg: undefined, sel: deg + 90 },
    ]);

    // Act
    const reaches = marks.map((h) => {
      const g = headingGlyph(100, 50, h);
      return Math.max(
        ...[g.aircraft, g.vector, g.arrow, g.tick].map((d) => (d ? farthest(d, 100, 50) : 0)),
      );
    });

    // Assert: half the 1.8 px stroke the widest of them is drawn with
    expect(Math.max(...reaches) + 0.9).toBeLessThanOrEqual(GLYPH_REACH_PX);
  });
});

describe('snapped', () => {
  it("bounds a lane's data by multiples of its quantum, a flat trace on a step one quantum below the top", () => {
    // Arrange
    const rows = [
      { lane: 'alt', r: flat(29_400) },
      { lane: 'alt', r: flat(30_000) },
      { lane: 'alt', r: { lo: 26_200, hi: 33_700 } },
      { lane: 'vs', r: { lo: 0, hi: 1800 } },
      { lane: 'vs', r: flat(0) },
      { lane: 'gs', r: flat(290.4) },
      { lane: 'gs', r: flat(290) },
      { lane: 'gs', r: { lo: 434, hi: 458 } },
      { lane: 'qnh', r: flat(29.93) },
      { lane: 'mach', r: { lo: 0.762, hi: 0.781 } },
      { lane: 'oat', r: flat(-45.3) },
      { lane: 'rssi', r: { lo: -15.3, hi: -9.3 } },
      { lane: 'rssi', r: { lo: -12.4, hi: -11.6 } },
      { lane: 'msgs', r: { lo: 1.2, hi: 3.8 } },
      { lane: 'msgs', r: { lo: 6.2, hi: 11.3 } },
      { lane: 'age', r: { lo: 0.4, hi: 5.4 } },
    ] as const;

    // Act
    const ranges = rows.map(({ lane, r }) => snapped(r, lane));

    // Assert
    expect(ranges).toEqual([
      { lo: 29_000, hi: 30_000 },
      { lo: 30_000, hi: 31_000 },
      { lo: 26_000, hi: 34_000 },
      { lo: 0, hi: 2000 },
      { lo: 0, hi: 500 },
      { lo: 290, hi: 300 },
      { lo: 290, hi: 300 },
      { lo: 430, hi: 460 },
      { lo: 29.93, hi: 29.94 },
      { lo: 0.76, hi: 0.79 },
      { lo: -46, hi: -45 },
      { lo: -20, hi: -5 },
      { lo: -15, hi: -10 },
      { lo: 0, hi: 5 },
      { lo: 5, hi: 15 },
      { lo: 0, hi: 6 },
    ]);
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
