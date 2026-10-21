import { afterEach, describe, expect, it } from 'bun:test';

import { STANDARD_ALTIMETER } from '../../../lib/altitude';
import { LAPSE_SEC } from '../../../lib/reports';
import { setDeclinationAt } from '../../../state/magnetic';
import { makeSample } from '../../../state/sampleFixture';
import { readoutOf } from '../../lanes/readout';
import { nowAt } from '../moment';
import { ndFrame, type NdReadouts, ndReadouts, ndSymbols } from './readout';

const NOW = 1000;
const FRESH = NOW - 1;
const STALE = NOW - LAPSE_SEC;
const AT = { lat: 35.5, lon: 139.8 };

/** The three readings of the selected heading, all known or all not. */
const held = (known: boolean) => ({ nd: known, bug: known, lane: known });

afterEach(() => {
  setDeclinationAt(() => () => 0);
});

describe('ndFrame', () => {
  const lapsedTrack = makeSample(NOW, {
    seen: 1,
    heading: 201,
    track: 198,
    heard: { heading: FRESH, track: STALE },
  });

  it('sets the mode, the box and the flags by what holds, a track heard LAPSE_SEC ago lapsed', () => {
    // Arrange
    const rows = [
      makeSample(NOW, {
        seen: 1,
        heading: 284,
        track: 289,
        heard: { heading: FRESH, track: FRESH },
      }),
      makeSample(NOW, { seen: 1, track: 47, heard: { track: FRESH } }),
      makeSample(NOW, { seen: 34, heading: 201, track: 198, heard: { heading: 966, track: 966 } }),
      lapsedTrack,
      makeSample(NOW, { seen: 1 }),
      makeSample(NOW, {
        seen: 1,
        heading: 284,
        track: 289,
        heard: { heading: NOW - 20, track: NOW - 20 },
      }),
    ];

    // Act
    const frames = rows.map((t) => ndFrame(nowAt(t, NOW)));

    // Assert
    expect(frames.map((f) => [f.mode, f.box, f.flags])).toEqual([
      ['track', '289', []],
      ['track', '047', []],
      ['lost', '---', ['TRK']],
      ['blank', '---', ['TRK']],
      ['blank', '---', ['TRK']],
      ['track', '289', []],
    ]);
  });

  it('orients on the track, else the last track, else the last heading', () => {
    // Arrange
    const rows = [
      makeSample(NOW, { heading: 284, track: 289, heard: { heading: FRESH, track: FRESH } }),
      makeSample(NOW, { track: 47, heard: { track: FRESH } }),
      lapsedTrack,
      makeSample(NOW, { seen: 40, heading: 201, heard: { heading: 900 } }),
      makeSample(NOW, { seen: 40 }),
    ];

    // Act
    const orients = rows.map((t) => ndFrame(nowAt(t, NOW)).orient);

    // Assert
    expect(orients).toEqual([289, 47, 198, 201, 0]);
  });

  it('orients the last frame on the magnetic track', () => {
    // Arrange
    setDeclinationAt(() => () => 7);
    const t = makeSample(NOW, { seen: 40, track: 205, at: AT, heard: { track: 900 } });

    // Act
    const frame = ndFrame(nowAt(t, NOW));

    // Assert
    expect(frame.orient).toBe(198);
  });

  it('says how long ago the target was last heard, only when lost', () => {
    // Arrange
    const rows = [makeSample(NOW, { seen: 34.4 }), makeSample(NOW, { seen: 14.9 })];

    // Act
    const lines = rows.map((t) => ndFrame(nowAt(t, NOW)).lastHeard);

    // Assert
    expect(lines).toEqual(['LAST HEARD 34 s', undefined]);
  });
});

const texts = (r: NdReadouts) =>
  [r.gs, r.tas, r.wind, r.sel, r.hdg, r.tat, r.sat].map((x) => x.text);

describe('ndReadouts', () => {
  it('reads every value of the corners, the wind magnetic and the heading as reported', () => {
    // Arrange
    setDeclinationAt(() => () => 7);
    const heard = Object.fromEntries(
      ['gs', 'tas', 'windDir', 'windSpeed', 'selHeading', 'navModes', 'heading', 'tat', 'oat'].map(
        (k) => [k, FRESH],
      ),
    );
    const t = makeSample(NOW, {
      seen: 1,
      gs: 462,
      tas: 438,
      windDir: 276,
      windSpeed: 63.6,
      selHeading: 310,
      navModes: ['autopilot'],
      heading: 284,
      tat: -4,
      oat: -56,
      at: AT,
      heard,
    });

    // Act
    const readouts = ndReadouts(nowAt(t, NOW));

    // Assert
    expect(texts(readouts)).toEqual(['462', '438', '269°/64', '310°', '284°', '-4°C', '-56°C']);
  });

  it('prints no sign on a temperature of zero and a plus on a positive one', () => {
    // Arrange
    const rows = [0.2, 3].map((v) =>
      makeSample(NOW, { seen: 1, tat: v, oat: v, heard: { tat: FRESH, oat: FRESH } }),
    );

    // Act
    const readouts = rows.map((t) => ndReadouts(nowAt(t, NOW)));

    // Assert
    expect(readouts.map((r) => [r.tat.text, r.sat.text])).toEqual([
      ['0°C', '0°C'],
      ['+3°C', '+3°C'],
    ]);
  });

  it('reads a blank with the degree mark only where the value carries one', () => {
    // Arrange
    const t = makeSample(NOW, { seen: 1 });

    // Act
    const readouts = ndReadouts(nowAt(t, NOW));

    // Assert
    expect(texts(readouts)).toEqual(['---', '---', '---', '---°', '---°', '---', '---']);
    expect(Object.values(readouts).map((r) => r.known)).toEqual(Array(7).fill(false));
  });

  it('lets a value lapse at exactly LAPSE_SEC', () => {
    // Arrange
    const t = makeSample(NOW, {
      seen: 1,
      gs: 462,
      tas: 438,
      heard: { gs: STALE, tas: STALE + 1 },
    });

    // Act
    const readouts = ndReadouts(nowAt(t, NOW));

    // Assert
    expect([readouts.gs.text, readouts.tas.text]).toEqual(['---', '438']);
  });

  it('is as old as the oldest of the inputs of a derived value', () => {
    // Arrange
    const wind = (speedAt: number) =>
      makeSample(NOW, {
        seen: 1,
        windDir: 276,
        windSpeed: 40,
        heard: { windDir: FRESH, windSpeed: speedAt },
      });
    const rows = [wind(NOW - LAPSE_SEC - 1), wind(NOW - LAPSE_SEC + 1), wind(FRESH)];

    // Act
    const readouts = rows.map((t) => ndReadouts(nowAt(t, NOW)));

    // Assert
    expect(readouts.map((r) => r.wind.text)).toEqual(['---', '276°/40', '276°/40']);
  });

  it('holds the selected heading exactly where the SEL HDG lane reads it', () => {
    // Arrange
    const rows = [29.9, LAPSE_SEC, LAPSE_SEC + 0.1].flatMap((age) =>
      [5, 45].map((modesAge) =>
        makeSample(NOW, {
          seen: 1,
          track: 289,
          at: AT,
          selHeading: 310,
          navModes: ['autopilot'],
          heard: { track: FRESH, selHeading: NOW - age, navModes: NOW - modesAge },
        }),
      ),
    );

    // Act
    const out = rows.map((t) => ({
      nd: ndReadouts(nowAt(t, NOW)).sel.known,
      bug: ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER).sel !== undefined,
      lane: readoutOf(['trk', 'selHdg'], t).first !== undefined,
    }));

    // Assert
    expect(out).toEqual([true, true, false, false, false, false].map(held));
  });

  it('blanks every value of a target not heard for LAPSE_SEC', () => {
    // Arrange
    const t = makeSample(NOW, {
      seen: 34,
      gs: 462,
      oat: -56,
      heading: 284,
      heard: { gs: FRESH, oat: FRESH, heading: FRESH },
    });

    // Act
    const readouts = ndReadouts(nowAt(t, NOW));

    // Assert
    expect(texts(readouts)).toEqual(['---', '---', '---', '---°', '---°', '---', '---']);
  });

  it('keeps the values that still hold, blanking those that lapse', () => {
    // Arrange
    const t = makeSample(NOW, {
      seen: 1,
      gs: 462,
      oat: -56,
      heading: 284,
      heard: { gs: FRESH, oat: FRESH, heading: STALE },
    });

    // Act
    const readouts = ndReadouts(nowAt(t, NOW));

    // Assert
    expect(texts(readouts)).toEqual(['462', '---', '---', '---°', '---°', '---', '-56°C']);
  });
});

const heardAll = (keys: string[], at: number) => Object.fromEntries(keys.map((k) => [k, at]));

describe('ndSymbols', () => {
  const KEYS = ['heading', 'track', 'selHeading', 'navModes'];
  const fields = { heading: 284, track: 289, selHeading: 310, navModes: ['autopilot'] };

  it('gives the track, the heading and the selected heading, magnetic, while the frame is live', () => {
    // Arrange
    setDeclinationAt(() => () => 7);
    const t = makeSample(NOW, { seen: 1, ...fields, at: AT, heard: heardAll(KEYS, FRESH) });

    // Act
    const symbols = ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER);

    // Assert
    expect(symbols).toEqual({ track: 282, heading: 284, sel: 310 });
  });

  it('leaves out what no longer holds', () => {
    // Arrange
    const heard = { ...heardAll(KEYS, FRESH), heading: STALE };
    const t = makeSample(NOW, { seen: 1, ...fields, heard });

    // Act
    const symbols = ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER);

    // Assert
    expect(symbols).toEqual({ track: 289, sel: 310 });
  });

  it('gives nothing in a blank frame or a lost one', () => {
    // Arrange
    const blank = makeSample(NOW, {
      seen: 1,
      ...fields,
      heard: { ...heardAll(KEYS, FRESH), track: STALE },
    });
    const lost = makeSample(NOW, { seen: 34, ...fields, heard: heardAll(KEYS, FRESH) });

    // Act
    const symbols = [blank, lost].map((t) => ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER));

    // Assert
    expect(symbols).toEqual([{}, {}]);
  });
});

const turningSample = (over: Partial<Parameters<typeof makeSample>[1]>, heard = {}) =>
  makeSample(NOW, {
    seen: 1,
    heading: 284,
    track: 289,
    gs: 360,
    trackRate: 1,
    ...over,
    heard: { heading: FRESH, track: FRESH, gs: FRESH, trackRate: FRESH, ...heard },
  });

describe('ndSymbols trend', () => {
  it('gives the turn rate and the ground speed of a turning aircraft', () => {
    // Arrange
    const t = turningSample({});

    // Act
    const symbols = ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER);

    // Assert
    expect(symbols.trend).toEqual({ rateDegS: 1, gsKt: 360 });
  });

  it('gives none for a turn slower than 0.3 °/s, at a standstill, or for an input not heard', () => {
    // Arrange
    const quiet = [
      turningSample({ trackRate: 0.2 }),
      turningSample({ trackRate: -0.29 }),
      turningSample({ gs: 0 }),
      turningSample({}, { gs: STALE }),
      turningSample({}, { trackRate: STALE }),
    ];

    // Act
    const trends = quiet.map((t) => ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER).trend);

    // Assert
    expect(trends).toEqual(Array(5).fill(undefined));
  });

  it('gives the trend of a turn of exactly 0.3 °/s either way', () => {
    // Arrange
    const turning = [0.3, -0.3].map((trackRate) => turningSample({ trackRate }));

    // Act
    const trends = turning.map((t) => ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER).trend?.rateDegS);

    // Assert
    expect(trends).toEqual([0.3, -0.3]);
  });
});

const climbingSample = (over: Partial<Parameters<typeof makeSample>[1]>, heard = {}) =>
  makeSample(NOW, {
    seen: 1,
    heading: 284,
    track: 289,
    alt: 29000,
    selAlt: 32000,
    verticalRate: 1800,
    gs: 420,
    ...over,
    heard: {
      heading: FRESH,
      track: FRESH,
      alt: FRESH,
      selAlt: FRESH,
      verticalRate: FRESH,
      gs: FRESH,
      ...heard,
    },
  });

describe('ndSymbols level-off', () => {
  it('gives the distance to the selected altitude at the rate and ground speed of the climb', () => {
    // Arrange
    const t = climbingSample({});

    // Act
    const symbols = ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER);

    // Assert
    expect(symbols.levelOffNm).toBeCloseTo(11.667, 3);
  });

  it('gives the distance of a descent toward a lower selected altitude', () => {
    // Arrange
    const t = climbingSample({ selAlt: 25000, verticalRate: -1800 });

    // Act
    const symbols = ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER);

    // Assert
    expect(symbols.levelOffNm).toBeCloseTo(15.556, 3);
  });

  it('gives none when level, moving away from the selected altitude, or an input has lapsed', () => {
    // Arrange
    const rows = [
      climbingSample({ verticalRate: 0 }),
      climbingSample({ selAlt: 27000 }),
      climbingSample({ selAlt: 32000, verticalRate: -1800 }),
      climbingSample({}, { selAlt: STALE }),
      climbingSample({}, { alt: STALE }),
      climbingSample({ selAlt: undefined }, { selAlt: undefined }),
    ];

    // Act
    const out = rows.map((t) => ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER).levelOffNm);

    // Assert
    expect(out).toEqual(Array(6).fill(undefined));
  });
});

const windy = (heard: object) =>
  makeSample(NOW, {
    seen: 1,
    track: 289,
    windDir: 276,
    windSpeed: 40,
    at: AT,
    heard: { track: FRESH, windDir: FRESH, windSpeed: FRESH, ...heard },
  });

describe('ndSymbols wind', () => {
  it('gives the direction the wind blows from, magnetic, while both its inputs hold', () => {
    // Arrange
    setDeclinationAt(() => () => 7);
    const t = windy({});

    // Act
    const symbols = ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER);

    // Assert
    expect(symbols.windFrom).toBe(269);
  });

  it('gives none once the speed has lapsed', () => {
    // Arrange
    const t = windy({ windSpeed: STALE });

    // Act
    const symbols = ndSymbols(nowAt(t, NOW), STANDARD_ALTIMETER);

    // Assert
    expect(symbols.windFrom).toBeUndefined();
  });
});

const heardEvery = (at: number) => ({
  heading: at,
  track: at,
  gs: at,
  trackRate: at,
  selHeading: at,
  selAlt: at,
  alt: at,
  verticalRate: at,
});

describe('the ND at a peeked sample', () => {
  const AGE = 200;
  const T = 1;
  const base = {
    seen: 1,
    heading: 284,
    track: 289,
    gs: 460,
    trackRate: 1.5,
    selHeading: 310,
    navModes: ['autopilot'],
    selAlt: 30_000,
    alt: 20_000,
    verticalRate: 1000,
    at: AT,
  };
  const rows = [
    makeSample(T, { ...base, heard: heardEvery(T) }),
    makeSample(T, { ...base, heard: { ...heardEvery(T), heading: T - LAPSE_SEC } }),
    makeSample(T, { ...base, heard: { ...heardEvery(T), track: T - LAPSE_SEC } }),
    makeSample(T, { ...base, heard: { ...heardEvery(T), selHeading: T - LAPSE_SEC } }),
    makeSample(T, { ...base, heard: { ...heardEvery(T), trackRate: T - LAPSE_SEC } }),
    makeSample(T, { ...base, heard: { ...heardEvery(T), selAlt: T - LAPSE_SEC } }),
  ];
  const liveOf = (s: (typeof rows)[number]) =>
    makeSample(T + AGE, {
      ...s,
      heard: Object.fromEntries(Object.entries(s.heard).map(([k, v]) => [k, (v ?? 0) + AGE])),
    });

  it('reads a sample at its own time as a live target whose data has exactly that age', () => {
    // Arrange
    const live = rows.map(liveOf);

    // Act
    const peeked = rows.map((r) => {
      const m = { kind: 'sample', r, instant: r.t } as const;
      return [ndFrame(m), ndReadouts(m), ndSymbols(m, STANDARD_ALTIMETER)];
    });
    const now = live.map((r) => {
      const m = nowAt(r, T + AGE);
      return [ndFrame(m), ndReadouts(m), ndSymbols(m, STANDARD_ALTIMETER)];
    });

    // Assert
    expect(peeked).toEqual(now);
  });

  it('drops the heading pointer exactly where the HDG lane reads a dash', () => {
    // Arrange
    const samples = [29.9, LAPSE_SEC, LAPSE_SEC + 0.1].map((age) =>
      makeSample(T, { ...base, heard: { ...heardEvery(T), heading: T - age } }),
    );

    // Act
    const out = samples.map((s) => ({
      pointer:
        ndSymbols({ kind: 'sample', r: s, instant: s.t }, STANDARD_ALTIMETER).heading !== undefined,
      lane: !readoutOf(['trk'], s).value.endsWith('---'),
    }));

    // Assert
    expect(out).toEqual([
      { pointer: true, lane: true },
      { pointer: false, lane: false },
      { pointer: false, lane: false },
    ]);
  });

  it('stands the compass where it last stood, with a dash, no flags and no symbols, over a gap', () => {
    // Arrange
    const empty = { kind: 'empty' } as const;

    // Act
    const out = {
      frame: ndFrame(empty, 123),
      corners: texts(ndReadouts(empty)),
      symbols: ndSymbols(empty, STANDARD_ALTIMETER),
    };

    // Assert
    expect(out).toEqual({
      frame: { mode: 'empty', orient: 123, box: '---', flags: [], lastHeard: undefined },
      corners: ['---', '---', '---', '---°', '---°', '---', '---'],
      symbols: {},
    });
  });
});
