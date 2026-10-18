import { afterEach, describe, expect, it } from 'bun:test';

import { STANDARD_ALTIMETER, qnhAltitudeFt } from '../../../lib/altitude';
import { INSTRUMENT_SEC } from '../../../lib/reports';
import { HPA_PER_INHG } from '../../../lib/units';
import { setDeclinationAt } from '../../../state/magnetic';
import { makeSample } from '../../../state/sampleFixture';
import type { Sample } from '../../../state/track';
import { fmaColumns, modeChangedAt, type PfdReadouts, pfdFma, pfdReadouts } from './readout';

const NOW = 1000;

afterEach(() => {
  setDeclinationAt(() => () => 0);
});
const FRESH = NOW - 1;
const STALE = NOW - INSTRUMENT_SEC;

/** A target whose samples are these, the last being what it reads now. */
const targetOf = (first: Sample, ...rest: Sample[]) => ({
  ...(rest.at(-1) ?? first),
  samples: [first, ...rest],
});

const selectedOf = (t: Sample) => {
  const out = pfdReadouts(t, NOW, STANDARD_ALTIMETER);
  return [out.selAlt, out.fmsAlt];
};

const baroOf = (t: Sample) => pfdReadouts(t, NOW, STANDARD_ALTIMETER).baro;

const altitudeOf = (t: Sample) => pfdReadouts(t, NOW, STANDARD_ALTIMETER).altitude;

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
    const out = pfdFma(t, NOW);

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
      targetOf(
        makeSample(NOW, { navModes: modes, heard: { navModes: FRESH }, seen: INSTRUMENT_SEC }),
      ),
    ];

    // Act
    const out = targets.map((t) => pfdFma(t, NOW));

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
    const out = pfdFma(t, NOW);

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
    const out = modeChangedAt(samples, 'vertical');

    // Assert
    expect(out).toBe(100);
  });

  it('is none for a mode present since the first sample, or a column that is empty', () => {
    // Arrange
    const samples = [reporting(90, ['vnav']), reporting(100, ['vnav'])];

    // Act
    const out = [modeChangedAt(samples, 'vertical'), modeChangedAt(samples, 'lateral')];

    // Assert
    expect(out).toEqual([undefined, undefined]);
  });

  it('does not count a gap in the modes reports as a change', () => {
    // Arrange
    const samples = [
      reporting(90, ['vnav']),
      makeSample(100, { navModes: ['althold'], heard: { navModes: 80 } }),
      reporting(110, ['vnav']),
    ];

    // Act
    const out = modeChangedAt(samples, 'vertical');

    // Assert
    expect(out).toBeUndefined();
  });
});

describe('pfdFma boxes', () => {
  it('boxes a column for 10 s after its text changed, and only that column', () => {
    // Arrange
    const t = targetOf(
      reporting(90, ['lnav', 'althold']),
      reporting(99, ['lnav', 'althold']),
      reporting(100, ['lnav', 'vnav']),
      reporting(105, ['lnav', 'vnav']),
    );

    // Act
    const out = [pfdFma(t, 105).boxed, pfdFma(t, 109.9).boxed, pfdFma(t, 110).boxed];

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
    const out = pfdFma(t, 105);

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
    const out = pfdReadouts(t, NOW, STANDARD_ALTIMETER);

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
      makeSample(NOW, { ...reported, heard: { ias: FRESH, mach: FRESH }, seen: INSTRUMENT_SEC }),
    ];

    // Act
    const out = targets.map((t) => pfdReadouts(t, NOW, STANDARD_ALTIMETER));

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
      makeSample(NOW, { roll: -12, heard: { roll: FRESH }, seen: INSTRUMENT_SEC }),
    ];

    // Act
    const out = targets.map((t) => pfdReadouts(t, NOW, STANDARD_ALTIMETER).roll);

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
    const out = pfdReadouts(t, NOW, STANDARD_ALTIMETER).fpv;

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
      pfdReadouts(t, NOW, STANDARD_ALTIMETER).fpv?.driftDeg,
      pfdReadouts(staleTrack, NOW, STANDARD_ALTIMETER).fpv?.driftDeg,
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
      makeSample(NOW, { ...live, heard, seen: INSTRUMENT_SEC }),
    ];

    // Act
    const out = targets.map((t) => pfdReadouts(t, NOW, STANDARD_ALTIMETER).fpv);

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
      makeSample(NOW, { alt: 37000, heard: { alt: FRESH }, seen: INSTRUMENT_SEC }),
    ];

    // Act
    const out = targets.map(altitudeOf);

    // Assert
    expect(out).toEqual([{ kind: 'flag' }, { kind: 'flag' }, { kind: 'flag' }]);
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
        seen: INSTRUMENT_SEC,
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
      makeSample(NOW, { navQnh: 1013.25, heard: { navQnh: FRESH }, seen: INSTRUMENT_SEC }),
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
        seen: INSTRUMENT_SEC,
      }),
    ];

    // Act
    const out = targets.map((t) => pfdReadouts(t, NOW, STANDARD_ALTIMETER).vs);

    // Assert
    expect(out).toEqual([-2200, undefined, undefined, undefined]);
  });
});
