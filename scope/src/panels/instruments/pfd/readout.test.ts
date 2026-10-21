import { afterEach, describe, expect, it } from 'bun:test';

import { STANDARD_ALTIMETER, qnhAltitudeFt } from '../../../lib/altitude';
import { LAPSE_SEC } from '../../../lib/reports';
import { HPA_PER_INHG } from '../../../lib/units';
import { setDeclinationAt } from '../../../state/magnetic';
import { makeSample } from '../../../state/sampleFixture';
import type { Sample } from '../../../state/track';
import { nowAt } from '../moment';
import {
  feetOf,
  fmaColumns,
  modeChangedAt,
  type PfdAltitude,
  type PfdReadouts,
  pfdFma,
  pfdReadouts,
} from './readout';

const NOW = 1000;

afterEach(() => {
  setDeclinationAt(() => () => 0);
});
const FRESH = NOW - 1;
const STALE = NOW - LAPSE_SEC;

/** A target whose samples are these, the last being what it reads now. */
const targetOf = (first: Sample, ...rest: Sample[]) => ({
  ...(rest.at(-1) ?? first),
  samples: [first, ...rest],
});

const selectedOf = (t: Sample) => {
  const out = pfdReadouts(nowAt(t, NOW), STANDARD_ALTIMETER);
  return [out.selAlt, out.fmsAlt];
};

const baroOf = (t: Sample) => pfdReadouts(nowAt(t, NOW), STANDARD_ALTIMETER).baro;

const altitudeOf = (t: Sample) => pfdReadouts(nowAt(t, NOW), STANDARD_ALTIMETER).altitude;

/** A sample at `t` reporting these modes, heard at `t`. */
const reporting = (t: number, navModes: string[]) =>
  makeSample(t, { navModes, heard: { navModes: t } });

describe('fmaColumns', () => {
  it('names the lateral and vertical modes engaged, the first of each in its order', () => {
    // Arrange
    const rows = [
      ['lnav', 'vnav'],
      ['approach', 'lnav'],
      ['vnav', 'althold'],
      ['tcas', 'autopilot'],
      [],
    ];

    // Act
    const out = rows.map(fmaColumns);

    // Assert
    expect(out).toEqual([
      { lateral: 'LNAV', vertical: 'VNAV' },
      { lateral: 'APP', vertical: undefined },
      { lateral: undefined, vertical: 'ALT HOLD' },
      { lateral: undefined, vertical: undefined },
      { lateral: undefined, vertical: undefined },
    ]);
  });
});

describe('pfdFma', () => {
  it('shows the modes and the autopilot while the modes hold', () => {
    // Arrange
    const t = targetOf(
      makeSample(NOW, { navModes: ['autopilot', 'lnav', 'vnav'], heard: { navModes: FRESH } }),
    );

    // Act
    const out = pfdFma(nowAt(t, NOW), t.samples);

    // Assert
    expect(out).toEqual({
      lateral: 'LNAV',
      vertical: 'VNAV',
      ap: true,
      boxed: { lateral: false, vertical: false },
    });
  });

  it('is empty, with no autopilot, when the modes were never reported, are stale or the target is lost', () => {
    // Arrange
    const modes = ['autopilot', 'lnav', 'vnav'];
    const targets = [
      targetOf(makeSample(NOW, { heard: {} })),
      targetOf(makeSample(NOW, { navModes: modes, heard: { navModes: STALE } })),
      targetOf(makeSample(NOW, { navModes: modes, heard: { navModes: FRESH }, seen: LAPSE_SEC })),
    ];

    // Act
    const out = targets.map((t) => pfdFma(nowAt(t, NOW), t.samples));

    // Assert
    const empty = {
      lateral: undefined,
      vertical: undefined,
      ap: false,
      boxed: { lateral: false, vertical: false },
    };
    expect(out).toEqual([empty, empty, empty]);
  });

  it('shows no autopilot while the modes hold without it', () => {
    // Arrange
    const t = targetOf(makeSample(NOW, { navModes: ['lnav'], heard: { navModes: FRESH } }));

    // Act
    const out = pfdFma(nowAt(t, NOW), t.samples);

    // Assert
    expect(out).toEqual({
      lateral: 'LNAV',
      vertical: undefined,
      ap: false,
      boxed: { lateral: false, vertical: false },
    });
  });
});

describe('modeChangedAt', () => {
  it('is when the column first read its current text after reading otherwise', () => {
    // Arrange
    const samples = [
      reporting(90, ['althold']),
      reporting(99, ['althold']),
      reporting(100, ['vnav']),
      reporting(105, ['vnav']),
    ];

    // Act
    const out = modeChangedAt(samples, 'vertical', Infinity);

    // Assert
    expect(out).toBe(100);
  });

  it('is none for a mode present since the first sample, or a column that is empty', () => {
    // Arrange
    const samples = [reporting(90, ['vnav']), reporting(100, ['vnav'])];

    // Act
    const out = [
      modeChangedAt(samples, 'vertical', Infinity),
      modeChangedAt(samples, 'lateral', Infinity),
    ];

    // Assert
    expect(out).toEqual([undefined, undefined]);
  });

  it('does not count a gap in the modes reports as a change', () => {
    // Arrange
    const samples = [
      reporting(90, ['vnav']),
      makeSample(100, { navModes: ['althold'], heard: { navModes: 100 - LAPSE_SEC } }),
      reporting(110, ['vnav']),
    ];

    // Act
    const out = modeChangedAt(samples, 'vertical', Infinity);

    // Assert
    expect(out).toBeUndefined();
  });
});

describe('pfdFma boxes', () => {
  it('boxes only by the changes up to the peeked sample', () => {
    // Arrange
    const samples = [90, 100, 105, 109.9, 110, 110.1, 120].map((t) =>
      reporting(t, t < 120 ? ['lnav', 'vnav'] : ['lnav', 'althold']),
    );
    samples[0] = reporting(90, ['lnav', 'althold']);
    const peeked = samples.slice(2, 6);

    // Act
    const out = peeked.map(
      (r) => pfdFma({ kind: 'sample', r, instant: r.t }, samples).boxed.vertical,
    );

    // Assert
    expect(out).toEqual([true, true, false, false]);
  });

  it('boxes a column for 10 s after its text changed, and only that column', () => {
    // Arrange
    const t = targetOf(
      reporting(90, ['lnav', 'althold']),
      reporting(99, ['lnav', 'althold']),
      reporting(100, ['lnav', 'vnav']),
      reporting(105, ['lnav', 'vnav']),
    );

    // Act
    const out = [
      pfdFma(nowAt(t, 105), t.samples).boxed,
      pfdFma(nowAt(t, 109.9), t.samples).boxed,
      pfdFma(nowAt(t, 110), t.samples).boxed,
    ];

    // Assert
    expect(out).toEqual([
      { lateral: false, vertical: true },
      { lateral: false, vertical: true },
      { lateral: false, vertical: false },
    ]);
  });

  it('boxes nothing for a column the mode left', () => {
    // Arrange
    const t = targetOf(reporting(100, ['lnav', 'vnav']), reporting(105, ['lnav']));

    // Act
    const out = pfdFma(nowAt(t, 105), t.samples);

    // Assert
    expect(out).toEqual({
      lateral: 'LNAV',
      vertical: undefined,
      ap: false,
      boxed: { lateral: false, vertical: false },
    });
  });
});

describe('pfdReadouts speed', () => {
  it('reads the speed as reported and the Mach without its leading zero while they hold', () => {
    // Arrange
    const t = makeSample(NOW, { ias: 261.6, mach: 0.79, heard: { ias: FRESH, mach: FRESH } });

    // Act
    const out = pfdReadouts(nowAt(t, NOW), STANDARD_ALTIMETER);

    // Assert
    expect(out).toEqual({
      ias: 261.6,
      mach: '.790',
      roll: undefined,
      fpv: undefined,
      altitude: { kind: 'flag' },
      selAlt: undefined,
      fmsAlt: undefined,
      baro: '',
      vs: undefined,
    });
  });

  it('blanks the speed and the Mach when stale, never reported or lost', () => {
    // Arrange
    const reported = { ias: 262, mach: 0.79 };
    const targets = [
      makeSample(NOW, { ...reported, heard: { ias: STALE, mach: STALE } }),
      makeSample(NOW, { heard: {} }),
      makeSample(NOW, { ...reported, heard: { ias: FRESH, mach: FRESH }, seen: LAPSE_SEC }),
    ];

    // Act
    const out = targets.map((t) => pfdReadouts(nowAt(t, NOW), STANDARD_ALTIMETER));

    // Assert
    const blank: PfdReadouts = {
      ias: undefined,
      mach: '',
      roll: undefined,
      fpv: undefined,
      altitude: { kind: 'flag' },
      selAlt: undefined,
      fmsAlt: undefined,
      baro: '',
      vs: undefined,
    };
    expect(out).toEqual([blank, blank, blank]);
  });
});

describe('pfdReadouts roll', () => {
  it('reads the roll while it holds, none when stale, never reported or lost', () => {
    // Arrange
    const targets = [
      makeSample(NOW, { roll: -12, heard: { roll: FRESH } }),
      makeSample(NOW, { roll: -12, heard: { roll: STALE } }),
      makeSample(NOW, { heard: {} }),
      makeSample(NOW, { roll: -12, heard: { roll: FRESH }, seen: LAPSE_SEC }),
    ];

    // Act
    const out = targets.map((t) => pfdReadouts(nowAt(t, NOW), STANDARD_ALTIMETER).roll);

    // Assert
    expect(out).toEqual([-12, undefined, undefined, undefined]);
  });
});

describe('pfdReadouts flight path vector', () => {
  const live = { verticalRate: 1800, gs: 462, roll: 15 };
  const heard = { verticalRate: FRESH, gs: FRESH, roll: FRESH };

  it('is the climb angle from the vertical rate and ground speed, centred without a heading', () => {
    // Arrange
    const t = makeSample(NOW, { ...live, heard });

    // Act
    const out = pfdReadouts(nowAt(t, NOW), STANDARD_ALTIMETER).fpv;

    // Assert
    expect(out?.fpaDeg).toBeCloseTo(2.203, 3);
    expect(out?.driftDeg).toBe(0);
  });

  it('drifts by the turn from the heading to the magnetic track while both hold', () => {
    // Arrange
    setDeclinationAt(() => () => 7);
    const t = makeSample(NOW, {
      ...live,
      heading: 100,
      track: 110,
      at: { lat: 35.5, lon: 139.8 },
      heard: { ...heard, heading: FRESH, track: FRESH },
    });
    const staleTrack = { ...t, heard: { ...t.heard, track: STALE } };

    // Act
    const out = [
      pfdReadouts(nowAt(t, NOW), STANDARD_ALTIMETER).fpv?.driftDeg,
      pfdReadouts(nowAt(staleTrack, NOW), STANDARD_ALTIMETER).fpv?.driftDeg,
    ];

    // Assert
    expect(out).toEqual([3, 0]);
  });

  it('is hidden without the roll, the vertical rate or a ground speed, at a standstill or lost', () => {
    // Arrange
    const targets = [
      makeSample(NOW, { ...live, roll: undefined, heard: { verticalRate: FRESH, gs: FRESH } }),
      makeSample(NOW, { ...live, heard: { ...heard, roll: STALE } }),
      makeSample(NOW, { ...live, heard: { ...heard, verticalRate: STALE } }),
      makeSample(NOW, { ...live, gs: undefined, heard: { verticalRate: FRESH, roll: FRESH } }),
      makeSample(NOW, { ...live, gs: 0, heard }),
      makeSample(NOW, { ...live, heard, seen: LAPSE_SEC }),
    ];

    // Act
    const out = targets.map((t) => pfdReadouts(nowAt(t, NOW), STANDARD_ALTIMETER).fpv);

    // Assert
    expect(out).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });
});

describe('pfdReadouts altitude', () => {
  it('reads the ground as GND', () => {
    // Arrange
    const t = makeSample(NOW, { alt: 'ground', heard: { alt: FRESH } });

    // Act
    const out = altitudeOf(t);

    // Assert
    expect(out).toEqual({ kind: 'ground' });
  });

  it('flags the altitude when stale, never reported or lost', () => {
    // Arrange
    const targets = [
      makeSample(NOW, { alt: 37000, heard: { alt: STALE } }),
      makeSample(NOW, { heard: {} }),
      makeSample(NOW, { alt: 37000, heard: { alt: FRESH }, seen: LAPSE_SEC }),
    ];

    // Act
    const out = targets.map(altitudeOf);

    // Assert
    expect(out).toEqual([{ kind: 'flag' }, { kind: 'flag' }, { kind: 'flag' }]);
  });

  it('flags the altitude from the lapse on, not before', () => {
    // Arrange
    const ages = [20, LAPSE_SEC - 0.1, LAPSE_SEC, LAPSE_SEC + 0.1];
    const targets = ages.map((age) => makeSample(NOW, { alt: 37000, heard: { alt: NOW - age } }));

    // Act
    const out = targets.map((t) => altitudeOf(t).kind);

    // Assert
    expect(out).toEqual(['feet', 'feet', 'flag', 'flag']);
  });

  it('reads the altitude as the crew does, on their setting even when it has gone stale', () => {
    // Arrange
    const below = { alt: 4750, navQnh: 1023.2 };
    const targets = [
      makeSample(NOW, { ...below, heard: { alt: FRESH, navQnh: FRESH } }),
      makeSample(NOW, { ...below, heard: { alt: FRESH, navQnh: STALE } }),
      makeSample(NOW, { alt: 37000, heard: { alt: FRESH } }),
    ];

    // Act
    const out = targets.map(altitudeOf);

    // Assert
    const crew = qnhAltitudeFt(4750, 1023.2 / HPA_PER_INHG);
    expect(out).toEqual([
      { kind: 'feet', ft: crew },
      { kind: 'feet', ft: crew },
      { kind: 'feet', ft: 37000 },
    ]);
  });
});

describe('feetOf', () => {
  it('is the feet of an altitude read in feet, none of the ground or a flag', () => {
    // Arrange
    const reads: PfdAltitude[] = [{ kind: 'feet', ft: 4750 }, { kind: 'ground' }, { kind: 'flag' }];

    // Act
    const out = reads.map(feetOf);

    // Assert
    expect(out).toEqual([4750, undefined, undefined]);
  });
});

describe('pfdReadouts selected altitudes', () => {
  it('reads the selected and the FMS altitude while they hold', () => {
    // Arrange
    const t = makeSample(NOW, {
      selAlt: 32000,
      fmsAlt: 34000,
      heard: { selAlt: FRESH, fmsAlt: FRESH },
    });

    // Act
    const out = selectedOf(t);

    // Assert
    expect(out).toEqual([32000, 34000]);
  });

  it('reads both as the crew set them, in steps of 100 ft', () => {
    // Arrange
    const t = makeSample(NOW, {
      selAlt: 14016,
      fmsAlt: 13984,
      heard: { selAlt: FRESH, fmsAlt: FRESH },
    });

    // Act
    const out = selectedOf(t);

    // Assert
    expect(out).toEqual([14000, undefined]);
  });

  it('shows a selected altitude of zero', () => {
    // Arrange
    const t = makeSample(NOW, { selAlt: 0, heard: { selAlt: FRESH } });

    // Act
    const out = selectedOf(t);

    // Assert
    expect(out).toEqual([0, undefined]);
  });

  it('hides the FMS altitude when it equals the selected one', () => {
    // Arrange
    const t = makeSample(NOW, {
      selAlt: 32000,
      fmsAlt: 32000,
      heard: { selAlt: FRESH, fmsAlt: FRESH },
    });

    // Act
    const out = selectedOf(t);

    // Assert
    expect(out).toEqual([32000, undefined]);
  });

  it('blanks each when stale, never reported, and both when lost', () => {
    // Arrange
    const reported = { selAlt: 32000, fmsAlt: 34000 };
    const targets = [
      makeSample(NOW, { ...reported, heard: { selAlt: STALE, fmsAlt: FRESH } }),
      makeSample(NOW, { ...reported, heard: { selAlt: FRESH, fmsAlt: STALE } }),
      makeSample(NOW, { heard: {} }),
      makeSample(NOW, {
        ...reported,
        heard: { selAlt: FRESH, fmsAlt: FRESH },
        seen: LAPSE_SEC,
      }),
    ];

    // Act
    const out = targets.map(selectedOf);

    // Assert
    expect(out).toEqual([
      [undefined, 34000],
      [32000, undefined],
      [undefined, undefined],
      [undefined, undefined],
    ]);
  });
});

describe('pfdReadouts baro', () => {
  it('reads the setting in inches of mercury to two decimals, as reported', () => {
    // Arrange
    const targets = [1013.25, 1010.9].map((hpa) =>
      makeSample(NOW, { navQnh: hpa, heard: { navQnh: FRESH } }),
    );

    // Act
    const out = targets.map(baroOf);

    // Assert
    expect(out).toEqual(['29.92', '29.85']);
  });

  it('is blank when stale, never reported or lost', () => {
    // Arrange
    const targets = [
      makeSample(NOW, { navQnh: 1013.25, heard: { navQnh: STALE } }),
      makeSample(NOW, { heard: {} }),
      makeSample(NOW, { navQnh: 1013.25, heard: { navQnh: FRESH }, seen: LAPSE_SEC }),
    ];

    // Act
    const out = targets.map(baroOf);

    // Assert
    expect(out).toEqual(['', '', '']);
  });
});

describe('pfdReadouts vertical rate', () => {
  it('reads the vertical rate while it holds, none when stale, never reported or lost', () => {
    // Arrange
    const targets = [
      makeSample(NOW, { verticalRate: -2200, heard: { verticalRate: FRESH } }),
      makeSample(NOW, { verticalRate: -2200, heard: { verticalRate: STALE } }),
      makeSample(NOW, { heard: {} }),
      makeSample(NOW, {
        verticalRate: -2200,
        heard: { verticalRate: FRESH },
        seen: LAPSE_SEC,
      }),
    ];

    // Act
    const out = targets.map((t) => pfdReadouts(nowAt(t, NOW), STANDARD_ALTIMETER).vs);

    // Assert
    expect(out).toEqual([-2200, undefined, undefined, undefined]);
  });
});

describe('the instrument at a peeked sample', () => {
  it('reads a sample at its own time as a live target whose data has exactly that age', () => {
    // Arrange
    const AGE = 200;
    const rows = [
      {
        ias: 250,
        roll: -5,
        alt: 12000,
        verticalRate: 500,
        gs: 300,
        heard: { ias: 1, roll: 1, alt: 1, verticalRate: 1, gs: 1, navModes: 1 },
      },
      {
        ias: 250,
        roll: -5,
        alt: 12000,
        verticalRate: 500,
        gs: 300,
        navModes: ['lnav'],
        heard: {
          ias: 1 - LAPSE_SEC,
          roll: 1,
          alt: 1 - LAPSE_SEC,
          verticalRate: 1,
          gs: 1,
          navModes: 1 - LAPSE_SEC,
        },
      },
      {
        ias: 250,
        roll: -5,
        alt: 12000,
        verticalRate: 500,
        gs: 300,
        navModes: ['lnav'],
        heard: { ias: 1, roll: 1, alt: 1, verticalRate: 1, gs: 1, navModes: 1 },
      },
      {
        ias: 250,
        heading: 90,
        track: 100,
        roll: -5,
        verticalRate: 500,
        gs: 300,
        heard: { heading: 1 - LAPSE_SEC + 0.1, track: 1, roll: 1, verticalRate: 1, gs: 1 },
      },
    ].map((over) => makeSample(1, over));
    const shifted = rows.map((s) =>
      makeSample(1 + AGE, {
        ...s,
        heard: Object.fromEntries(Object.entries(s.heard).map(([k, v]) => [k, (v ?? 0) + AGE])),
      }),
    );
    const expected = shifted.map((r) => {
      const m = nowAt(r, 1 + AGE);
      return { readouts: pfdReadouts(m, STANDARD_ALTIMETER), fma: pfdFma(m, [r]) };
    });

    // Act
    const peeked = rows.map((r) => {
      const m = { kind: 'sample', r, instant: r.t } as const;
      return { readouts: pfdReadouts(m, STANDARD_ALTIMETER), fma: pfdFma(m, [r]) };
    });

    // Assert
    expect(peeked).toEqual(expected);
  });

  it('shows nothing, and no annunciator, for the empty moment', () => {
    // Arrange
    const empty = { kind: 'empty' } as const;

    // Act
    const out = { readouts: pfdReadouts(empty, STANDARD_ALTIMETER), fma: pfdFma(empty, []) };

    // Assert
    expect(out).toEqual({
      readouts: {
        ias: undefined,
        mach: '',
        roll: undefined,
        fpv: undefined,
        altitude: { kind: 'flag' },
        selAlt: undefined,
        fmsAlt: undefined,
        baro: '',
        vs: undefined,
      },
      fma: {
        lateral: undefined,
        vertical: undefined,
        ap: false,
        boxed: { lateral: false, vertical: false },
      },
    });
  });
});
