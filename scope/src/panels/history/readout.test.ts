import { describe, expect, it } from 'bun:test';

import { makeSample as sample } from '../../state/sampleFixture';
import { altTargets, readoutOf } from './readout';

describe('altTargets', () => {
  it('puts first the target the aircraft levels at first: the lower in a climb, the higher in a descent', () => {
    // Arrange
    const rows = [
      { alt: 29_600, vs: 1800, sel: 32_000, fms: 34_000 },
      { alt: 29_600, vs: 1800, sel: 36_000, fms: 34_000 },
      { alt: 20_000, vs: -2000, sel: 12_000, fms: 15_000 },
      { alt: 20_000, vs: -2000, sel: 15_000, fms: 12_000 },
      { alt: 33_900, vs: 0, sel: 30_000, fms: 34_000 },
    ];

    // Act
    const targets = rows.map((r) => altTargets(r.alt, r.vs, r.sel, r.fms));

    // Assert
    expect(targets.map((t) => [t?.first.key, t?.other?.key])).toEqual([
      ['selAlt', 'fmsAlt'],
      ['fmsAlt', 'selAlt'],
      ['fmsAlt', 'selAlt'],
      ['selAlt', 'fmsAlt'],
      ['fmsAlt', 'selAlt'],
    ]);
  });

  it('shows one target when the two agree to the selected altitude’s resolution', () => {
    // Arrange
    const rows = [
      { sel: 34_000, fms: 34_000 },
      { sel: 34_000, fms: 34_016 },
    ];

    // Act
    const targets = rows.map((r) => altTargets(29_600, 1800, r.sel, r.fms));

    // Assert
    expect(targets).toEqual([
      { first: { key: 'selAlt', ft: 34_000 } },
      { first: { key: 'selAlt', ft: 34_000 } },
    ]);
  });

  it('shows the one target known, and none without either', () => {
    // Arrange
    const rows = [
      { sel: undefined, fms: 34_000 },
      { sel: 32_000, fms: undefined },
      { sel: undefined, fms: undefined },
    ];

    // Act
    const targets = rows.map((r) => altTargets(29_600, 1800, r.sel, r.fms));

    // Assert
    expect(targets).toEqual([
      { first: { key: 'fmsAlt', ft: 34_000 } },
      { first: { key: 'selAlt', ft: 32_000 } },
      null,
    ]);
  });

  it('puts the selected altitude first while level with the altitude unknown', () => {
    // Arrange
    const sel = 30_000;
    const fms = 34_000;

    // Act
    const targets = altTargets(undefined, undefined, sel, fms);

    // Assert
    expect([targets?.first.key, targets?.other?.key]).toEqual(['selAlt', 'fmsAlt']);
  });
});

describe('readoutOf', () => {
  it('reads the lane as the table does, without its unit, but for a bound', () => {
    // Arrange
    const s = sample(1, { gs: 462, verticalRate: 1800, nic: 8, rc: 186 });
    const lanes = [['gs'], ['vs'], ['nic']] as const;

    // Act
    const readouts = lanes.map((keys) => readoutOf(keys, s));

    // Assert
    expect(readouts).toEqual([{ value: '462' }, { value: '+1800' }, { value: '<0.1 NM' }]);
  });

  it('reads the selected heading after the track and heading, when it is plotted and steers', () => {
    // Arrange
    const s = sample(1, { heading: 284, selHeading: 310, navModes: ['autopilot'] });
    const lanes = [['trk', 'selHdg'], ['trk']] as const;

    // Act
    const readouts = lanes.map((keys) => readoutOf(keys, s));

    // Assert
    expect(readouts).toEqual([
      { value: '--- / 284°', first: { key: 'selHdg', text: '310°' } },
      { value: '--- / 284°' },
    ]);
  });

  it('reads the altitude, the target it levels at first, then the other', () => {
    // Arrange
    const climbing = { alt: 29_600, verticalRate: 1800 };
    const samples = [
      sample(1, { ...climbing, selAlt: 32_000, fmsAlt: 34_000 }),
      sample(1, { ...climbing, selAlt: 34_000, fmsAlt: 34_000 }),
    ];

    // Act
    const readouts = samples.map((s) => readoutOf(['alt', 'selAlt', 'fmsAlt'], s));

    // Assert
    expect(readouts).toEqual([
      {
        value: 'FL296',
        first: { key: 'selAlt', text: 'FL320' },
        other: { key: 'fmsAlt', text: 'FL340' },
      },
      { value: 'FL296', first: { key: 'selAlt', text: 'FL340' } },
    ]);
  });

  it('reads only the targets plotted in the lane', () => {
    // Arrange
    const s = sample(1, { alt: 29_600, verticalRate: 1800, selAlt: 32_000, fmsAlt: 34_000 });

    // Act
    const readout = readoutOf(['alt', 'fmsAlt'], s);

    // Assert
    expect(readout).toEqual({ value: 'FL296', first: { key: 'fmsAlt', text: 'FL340' } });
  });
});
