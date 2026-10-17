import { describe, expect, it } from 'bun:test';

import { altTargets } from './readout';

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
