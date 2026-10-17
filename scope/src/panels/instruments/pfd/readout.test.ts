import { describe, expect, it } from 'bun:test';

import { INSTRUMENT_SEC } from '../../../lib/reports';
import { makeSample } from '../../../state/sampleFixture';
import type { Sample } from '../../../state/track';
import { fmaColumns, modeChangedAt, pfdFma } from './readout';

const NOW = 1000;
const FRESH = NOW - 1;
const STALE = NOW - INSTRUMENT_SEC;

/** A target whose samples are these, the last being what it reads now. */
const targetOf = (first: Sample, ...rest: Sample[]) => ({
  ...(rest.at(-1) ?? first),
  samples: [first, ...rest],
});

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
