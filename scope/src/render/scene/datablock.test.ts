import { describe, expect, it } from 'bun:test';

import { dataBlock, extraLines, type Run } from './datablock';
import { makeTrack as track } from './trackFixture';

const text = (runs: Run[]) => runs.map((r) => r.text).join('');

describe('dataBlock', () => {
  it('shows callsign, then altitude with climb arrow and the type or GSW by phase', () => {
    // Arrange
    const t = track({ baroRate: -1200 });
    const phaseA = 0;
    const phaseB = 8;

    // Act
    const [a, b] = [phaseA, phaseB].map((now) => dataBlock(t, now));

    // Assert
    expect(a?.prefix).toBeNull();
    expect(a?.line1).toBe('ANA241');
    expect([a, b].map((x) => text(x?.line2 ?? [])).toSorted()).toEqual(['110↓ 29M', '110↓ B789']);
  });

  it('falls back to the hex and the bracketed category when enrichment is missing', () => {
    // Arrange
    const t = track({
      flight: undefined,
      registration: undefined,
      type: undefined,
      category: 'A1',
      gs: undefined,
    });

    // Act
    const block = dataBlock(t, 0);

    // Assert
    expect(block.line1).toBe('867A01');
    expect(['110  [A1]', '110  ---']).toContain(text(block.line2));
  });

  it('adds the emergency prefix', () => {
    // Arrange
    const t = track({ squawk: '7600' });

    // Act
    const block = dataBlock(t, 0);

    // Assert
    expect(block.prefix).toBe('RF');
  });

  it('flips every block on the same clock, whatever the hex', () => {
    // Arrange
    const a = track({ hex: '000000' });
    const b = track({ hex: '0000ff' });
    const now = 4;

    // Act
    const [ba, bb] = [dataBlock(a, now), dataBlock(b, now)];

    // Assert
    expect(ba.line2).toEqual(bb.line2);
  });

  it('follows the level and trend with the selected level as intent', () => {
    // Arrange
    const t = track({ baroRate: 1500, selAlt: 16000 });

    // Act
    const block = dataBlock(t, 0);

    // Assert
    expect(block.line2).toEqual([
      { text: '110↑', intent: false },
      { text: '160', intent: true },
      { text: ' B789', intent: false },
    ]);
  });

  it('marks an aircraft holding its selected level with a check instead', () => {
    // Arrange
    const t = track({ alt: 34860, selAlt: 35000, navQnh: 1013.2 });

    // Act
    const block = dataBlock(t, 0);

    // Assert
    expect(block.line2).toEqual([
      { text: '349', intent: false },
      { text: '✓', intent: true },
      { text: ' B789', intent: false },
    ]);
  });

  it('puts the heading that steers the aircraft on a third line', () => {
    // Arrange
    const cases = [
      track({ selHeading: 95, navModes: ['autopilot'] }),
      track({ selHeading: 95, navModes: ['approach'] }),
      track(),
    ];

    // Act
    const out = cases.map((t) => dataBlock(t, 0).line3);

    // Assert
    expect(out).toEqual(['095°', null, null]);
  });

  it('prints the selected level as the crew set it, without the QNH correction', () => {
    // Arrange
    const t = track({ alt: 5000, selAlt: 5000 });
    const altimeter = { transitionAltFt: 14000, qnhInHg: 29.62 };

    // Act
    const block = dataBlock(t, 0, altimeter);

    // Assert
    expect(text(block.line2)).toBe('047 050 B789');
  });
});

describe('extraLines', () => {
  it('counts the emergency prefix and the selected heading line', () => {
    // Arrange
    const cases = [
      track(),
      track({ squawk: '7700' }),
      track({ selHeading: 95 }),
      track({ squawk: '7700', selHeading: 95 }),
    ];

    // Act
    const out = cases.map(extraLines);

    // Assert
    expect(out).toEqual([0, 1, 1, 2]);
  });
});
