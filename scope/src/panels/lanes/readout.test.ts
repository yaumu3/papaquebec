import { describe, expect, it } from 'bun:test';

import { LAPSE_SEC } from '../../lib/reports';
import { makeHeardSample as heardSample, makeSample as sample } from '../../state/sampleFixture';
import { altTargets, heldIntents, readoutOf, readoutSlots } from './readout';

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
    const s = heardSample(1, { gs: 462, verticalRate: 1800, nic: 8, rc: 186 });
    const lanes = [['gs'], ['vs'], ['nic']] as const;

    // Act
    const readouts = lanes.map((keys) => readoutOf(keys, s));

    // Assert
    expect(readouts).toEqual([{ value: '462' }, { value: '+1800' }, { value: '<0.1 NM' }]);
  });

  it('reads the selected heading after the track and heading, when it is plotted and steers', () => {
    // Arrange
    const s = sample(1, {
      heading: 284,
      selHeading: 310,
      navModes: ['autopilot'],
      heard: { heading: 1, selHeading: 1 },
    });
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
      heardSample(1, { ...climbing, selAlt: 32_000, fmsAlt: 34_000 }),
      heardSample(1, { ...climbing, selAlt: 34_000, fmsAlt: 34_000 }),
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
      { value: 'FL296', first: { key: 'selAlt', text: 'FL340' }, agreed: true },
    ]);
  });

  it('reads only the targets plotted in the lane', () => {
    // Arrange
    const s = heardSample(1, { alt: 29_600, verticalRate: 1800, selAlt: 32_000, fmsAlt: 34_000 });

    // Act
    const readout = readoutOf(['alt', 'fmsAlt'], s);

    // Assert
    expect(readout).toEqual({ value: 'FL296', first: { key: 'fmsAlt', text: 'FL340' } });
  });

  it('reads a heading heard longer ago than the gap as unknown, as the glyph leaves it out', () => {
    // Arrange
    const s = sample(100, {
      track: 90,
      heading: 85,
      selHeading: 310,
      navModes: ['autopilot'],
      heard: { track: 100, heading: 59, selHeading: 100 },
    });

    // Act
    const readout = readoutOf(['trk', 'selHdg'], s);

    // Assert
    expect(readout).toEqual({ value: '090° / ---', first: { key: 'selHdg', text: '310°' } });
  });
});

describe('readoutOf, for readings heard a gap before the cursor', () => {
  it('reads a reading heard exactly the lapse before the cursor as unknown, not one just under it', () => {
    // Arrange
    const rows = [29.9, 30, 30.1].map((d) => sample(1000, { gs: 290, heard: { gs: 1000 - d } }));

    // Act
    const readouts = rows.map((s) => readoutOf(['gs'], s));

    // Assert
    expect(readouts).toEqual([
      { value: '290' },
      { value: '---', unknown: true },
      { value: '---', unknown: true },
    ]);
  });

  it("reads each lane's reading only while heard within the gap, a reading of reception always", () => {
    // Arrange
    const stale = 100 - LAPSE_SEC - 1;
    const rows = [
      { keys: ['gs'], s: sample(100, { gs: 290, heard: { gs: 100 } }) },
      { keys: ['gs'], s: sample(100, { gs: 290, heard: { gs: stale } }) },
      { keys: ['msgs'], s: sample(100, { messageRate: 4.2 }) },
      {
        keys: ['wind'],
        s: sample(100, { windDir: 270, windSpeed: 25, heard: { windDir: 100, windSpeed: stale } }),
      },
    ] as const;

    // Act
    const readouts = rows.map((r) => readoutOf(r.keys, r.s));

    // Assert
    expect(readouts).toEqual([
      { value: '290' },
      { value: '---', unknown: true },
      { value: '4.2' },
      { value: '---', unknown: true },
    ]);
  });

  it('leaves a target heard a gap before the cursor unknown in its slot, the altitude read', () => {
    // Arrange
    const s = sample(100, {
      alt: 29_600,
      verticalRate: 1800,
      selAlt: 32_000,
      fmsAlt: 34_000,
      heard: { alt: 100, verticalRate: 100, selAlt: 100 - LAPSE_SEC - 1, fmsAlt: 100 },
    });

    // Act
    const slots = readoutSlots(readoutOf(['alt', 'selAlt', 'fmsAlt'], s), ['selAlt', 'fmsAlt']);

    // Assert
    expect(slots).toEqual([{ key: 'fmsAlt', text: 'FL340' }, { key: 'selAlt' }]);
  });
});

describe('heldIntents', () => {
  it('takes the intents plotted in the lane that the contact ever had a value of', () => {
    // Arrange
    const keys = ['alt', 'selAlt', 'fmsAlt'] as const;
    const contacts = [
      [sample(1, { alt: 30_000 }), sample(2, { alt: 30_100 })],
      [sample(1, { selAlt: 32_000 }), sample(2, { selAlt: 32_000 })],
      [sample(1, { selAlt: 32_000, fmsAlt: 34_000 }), sample(2, { selAlt: 32_000 })],
      [sample(1, { fmsAlt: 34_000 }), sample(2), sample(3, { selAlt: 32_000 })],
    ];

    // Act
    const held = contacts.map((samples) => heldIntents(keys, samples));

    // Assert
    expect(held).toEqual([[], ['selAlt'], ['selAlt', 'fmsAlt'], ['selAlt', 'fmsAlt']]);
  });

  it('leaves out an intent the lane does not plot, and a heading selection that never steered', () => {
    // Arrange
    const rows = [
      { keys: ['alt', 'selAlt'], samples: [sample(1, { selAlt: 32_000, fmsAlt: 34_000 })] },
      { keys: ['trk', 'selHdg'], samples: [sample(1, { selHeading: 310, navModes: ['lnav'] })] },
      {
        keys: ['trk', 'selHdg'],
        samples: [sample(1, { selHeading: 310, navModes: ['autopilot'] })],
      },
    ] as const;

    // Act
    const held = rows.map((r) => heldIntents(r.keys, r.samples));

    // Assert
    expect(held).toEqual([['selAlt'], [], ['selHdg']]);
  });
});

describe('readoutSlots', () => {
  it('gives each intent the contact had a slot, the one levelled at first leading, one unknown now a placeholder, one that agrees with the first none of its own', () => {
    // Arrange
    const both = ['selAlt', 'fmsAlt'] as const;
    const sel = { key: 'selAlt', text: 'FL320' } as const;
    const fms = { key: 'fmsAlt', text: 'FL340' } as const;
    const rows = [
      { r: { value: 'FL296', first: fms, other: sel }, held: both },
      { r: { value: 'FL296', first: sel }, held: both },
      { r: { value: 'FL296', first: sel, agreed: true as const }, held: both },
      { r: { value: 'FL296', first: fms }, held: both },
      { r: { value: 'FL296' }, held: both },
      { r: { value: 'FL296', first: sel }, held: ['selAlt'] as const },
      { r: { value: 'FL296' }, held: ['selAlt'] as const },
      { r: { value: 'FL296' }, held: [] as const },
    ];

    // Act
    const slots = rows.map(({ r, held }) => readoutSlots(r, held));

    // Assert
    expect(slots).toEqual([
      [fms, sel],
      [sel, { key: 'fmsAlt' }],
      [sel],
      [fms, { key: 'selAlt' }],
      [{ key: 'selAlt' }, { key: 'fmsAlt' }],
      [sel],
      [{ key: 'selAlt' }],
      [],
    ]);
  });
});

describe('readoutOf over a gap', () => {
  it('reads the dash of no sample, not as an unknown reading', () => {
    // Arrange
    const lanes = [['alt'], ['trk', 'selHdg']] as const;

    // Act
    const readouts = lanes.map((keys) => readoutOf(keys, null));

    // Assert
    expect(readouts).toEqual([{ value: '---' }, { value: '---' }]);
  });
});
