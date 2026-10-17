import { describe, expect, it } from 'bun:test';

import { INSTRUMENT_SEC } from '../../../lib/reports';
import { makeSample } from '../../../state/sampleFixture';
import { fmaColumns, pfdFma } from './readout';

const NOW = 1000;
const FRESH = NOW - 1;
const STALE = NOW - INSTRUMENT_SEC;

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
    const t = makeSample(NOW, {
      navModes: ['autopilot', 'lnav', 'vnav'],
      heard: { navModes: FRESH },
    });

    // Act
    const out = pfdFma(t, NOW);

    // Assert
    expect(out).toEqual({ lateral: 'LNAV', vertical: 'VNAV', ap: true });
  });

  it('is empty, with no autopilot, when the modes were never reported, are stale or the target is lost', () => {
    // Arrange
    const modes = ['autopilot', 'lnav', 'vnav'];
    const targets = [
      makeSample(NOW, { heard: {} }),
      makeSample(NOW, { navModes: modes, heard: { navModes: STALE } }),
      makeSample(NOW, { navModes: modes, heard: { navModes: FRESH }, seen: INSTRUMENT_SEC }),
    ];

    // Act
    const out = targets.map((t) => pfdFma(t, NOW));

    // Assert
    const empty = { lateral: undefined, vertical: undefined, ap: false };
    expect(out).toEqual([empty, empty, empty]);
  });

  it('shows no autopilot while the modes hold without it', () => {
    // Arrange
    const t = makeSample(NOW, { navModes: ['lnav'], heard: { navModes: FRESH } });

    // Act
    const out = pfdFma(t, NOW);

    // Assert
    expect(out).toEqual({ lateral: 'LNAV', vertical: undefined, ap: false });
  });
});
