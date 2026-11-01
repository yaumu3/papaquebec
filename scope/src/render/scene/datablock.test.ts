import { describe, expect, it } from 'bun:test';

import { STANDARD_ALTIMETER } from '../../lib/altitude';
import { blockExtraLines, dataBlock, extraLines, type Run } from './datablock';
import { makeTrack as track } from './trackFixture';

const text = (runs: Run[]) => runs.map((r) => r.text).join('');
describe('dataBlock', () => {
  it('shows callsign, then altitude with climb arrow and the type or GSW by phase', () => {
    // Arrange
    const t = track({ verticalRate: -1200 });
    const phaseA = 0;
    const phaseB = 8;

    // Act
    const [a, b] = [phaseA, phaseB].map((now) => dataBlock(t, now, STANDARD_ALTIMETER));

    // Assert
    expect(a?.tags).toEqual([]);
    expect(a?.line1).toBe('TEST01');
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
    const block = dataBlock(t, 0, STANDARD_ALTIMETER);

    // Assert
    expect(block.line1).toBe('D00001');
    expect(['110  [A1]', '110  ---']).toContain(text(block.line2));
  });

  it('tags the block with the emergency', () => {
    // Arrange
    const t = track({ squawk: '7600' });

    // Act
    const block = dataBlock(t, 0, STANDARD_ALTIMETER);

    // Assert
    expect(text(block.tags)).toBe('RF');
  });

  it('tags the emergency and the advisory as alerts, then the priority, then the ident', () => {
    // Arrange
    const ra = { multipleThreats: false, terminated: false };
    const t = track({ squawk: '7700', emergency: 'lifeguard', ra, ident: true });

    // Act
    const block = dataBlock(t, 0, STANDARD_ALTIMETER);

    // Assert
    expect(text(block.tags)).toBe('EM RA MED ID');
    expect(block.tags.filter((r) => r.text !== ' ').map((r) => r.tone)).toEqual([
      'alert',
      'alert',
      'caution',
      'ident',
    ]);
  });

  it('drops the tags of least precedence that would run past the block', () => {
    // Arrange
    const ra = { multipleThreats: false, terminated: false };
    const t = track({ squawk: '7700', emergency: 'minfuel', ra, ident: true });

    // Act
    const block = dataBlock(t, 0, STANDARD_ALTIMETER);

    // Assert
    expect(text(block.tags)).toBe('EM RA FUEL');
  });

  it('tags minimum fuel and lifeguard as a priority, not an emergency', () => {
    // Arrange
    const cases = [track({ emergency: 'minfuel' }), track({ emergency: 'lifeguard' })];

    // Act
    const blocks = cases.map((t) => dataBlock(t, 0, STANDARD_ALTIMETER));

    // Assert
    expect(blocks.map((b) => b.tags)).toEqual([
      [{ text: 'FUEL', tone: 'caution' }],
      [{ text: 'MED', tone: 'caution' }],
    ]);
  });

  it('flips every block on the same clock, whatever the hex', () => {
    // Arrange
    const a = track({ hex: 'd00000' });
    const b = track({ hex: 'd000ff' });
    const now = 4;

    // Act
    const [ba, bb] = [dataBlock(a, now, STANDARD_ALTIMETER), dataBlock(b, now, STANDARD_ALTIMETER)];

    // Assert
    expect(ba.line2).toEqual(bb.line2);
  });

  it('follows the level and trend with the selected level as intent', () => {
    // Arrange
    const t = track({ verticalRate: 1500, selAlt: 16000 });

    // Act
    const block = dataBlock(t, 0, STANDARD_ALTIMETER);

    // Assert
    expect(block.line2).toEqual([
      { text: '110↑', tone: 'plain' },
      { text: '160', tone: 'intent' },
      { text: ' B789', tone: 'plain' },
    ]);
  });

  it('marks an aircraft holding its selected level with a check instead', () => {
    // Arrange
    const t = track({ alt: 34860, selAlt: 35000, navQnh: 1013.2 });

    // Act
    const block = dataBlock(t, 0, STANDARD_ALTIMETER);

    // Assert
    expect(block.line2).toEqual([
      { text: '349', tone: 'plain' },
      { text: '✓', tone: 'intent' },
      { text: ' B789', tone: 'plain' },
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
    const out = cases.map((t) => dataBlock(t, 0, STANDARD_ALTIMETER).line3);

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
  it('counts the tag line and the heading line alike for a track and its block', () => {
    // Arrange
    const cases = [
      track(),
      track({ squawk: '7700' }),
      track({ emergency: 'minfuel' }),
      track({ selHeading: 95 }),
      track({ squawk: '7700', selHeading: 95 }),
    ];

    // Act
    const out = cases.map((t) => [
      blockExtraLines(dataBlock(t, 0, STANDARD_ALTIMETER)),
      extraLines(t),
    ]);

    // Assert
    expect(out).toEqual([
      [0, 0],
      [1, 1],
      [1, 1],
      [1, 1],
      [2, 2],
    ]);
  });
});
