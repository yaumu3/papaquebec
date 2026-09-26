import { describe, expect, it } from 'bun:test';

import type { Track } from '../../state/track';
import { Shape } from '../protocol';
import {
  airspaceColor,
  dataBlock,
  isStale,
  targetShape,
  THEME,
  trackColor,
  trackLabel,
} from './rules';
import { makeTrack as track } from './trackFixture';

describe('isStale', () => {
  it('is stale after 30 s without a position or when the position is a lastPosition', () => {
    // Arrange
    const cases = [
      track({ seenPos: 5 }),
      track({ seenPos: 31 }),
      track({ position: { kind: 'last', lat: 0, lon: 0, x: 0, y: 0 } }),
    ];

    // Act
    const out = cases.map(isStale);

    // Assert
    expect(out).toEqual([false, true, true]);
  });
});

describe('trackColor', () => {
  it('ranks emergency over selected over stale over ground over climb state', () => {
    // Arrange
    const cases: [Track, string | null][] = [
      [track({ squawk: '7700' }), '867a01'],
      [track(), '867a01'],
      [track({ seenPos: 60 }), null],
      [track({ alt: 'ground', baroRate: 1500 }), null],
      [track({ baroRate: 1500 }), null],
      [track({ baroRate: -1500 }), null],
      [track(), null],
    ];

    // Act
    const out = cases.map(([t, sel]) => trackColor(t, sel));

    // Assert
    expect(out).toEqual([
      THEME.emergency,
      THEME.selected,
      THEME.stale,
      THEME.ground,
      THEME.climb,
      THEME.descend,
      THEME.level,
    ]);
  });
});

describe('targetShape', () => {
  it('encodes the source in the glyph and filtered targets as hollow diamonds', () => {
    // Arrange
    const cases: [Track, 'shown' | 'filtered'][] = [
      [track(), 'shown'],
      [track({ source: 'mlat' }), 'shown'],
      [track({ source: 'tisb' }), 'shown'],
      [track(), 'filtered'],
    ];

    // Act
    const out = cases.map(([t, v]) => targetShape(t, v));

    // Assert
    expect(out).toEqual([Shape.Square, Shape.SquareRing, Shape.Diamond, Shape.HollowDiamond]);
  });
});

describe('trackLabel', () => {
  it('prefers callsign, then registration, then the hex', () => {
    // Arrange
    const cases = [
      track(),
      track({ flight: undefined, registration: 'JA737T' }),
      track({ flight: undefined, registration: undefined }),
    ];

    // Act
    const labels = cases.map(trackLabel);

    // Assert
    expect(labels).toEqual(['ANA241', 'JA737T', '867A01']);
  });
});

describe('dataBlock', () => {
  it('shows callsign, then altitude with climb arrow and the type or GSW by phase', () => {
    // Arrange
    const t = track({ baroRate: -1200 });
    const phaseA = 0;
    const phaseB = 8;

    // Act
    const a = dataBlock(t, phaseA);
    const b = dataBlock(t, phaseB);

    // Assert
    expect(a.prefix).toBeNull();
    expect(a.line1).toBe('ANA241');
    expect([a.line2, b.line2].toSorted()).toEqual(['110↓ 29M', '110↓ B789']);
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
    expect(['110  [A1]', '110  ---']).toContain(block.line2);
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
    expect(ba.line2).toBe(bb.line2);
  });
});

describe('airspaceColor', () => {
  it('keeps control zones and special-use areas bright and dims area sectors', () => {
    // Arrange
    const kinds = ['CTR', 'ATZ', 'R', 'D', 'P', 'TCA', 'ACA', 'PCA', 'INFO', 'TMA', undefined];

    // Act
    const colors = kinds.map(airspaceColor);

    // Assert
    expect(colors.slice(0, 5)).toEqual(Array(5).fill(THEME.airspace));
    expect(colors.slice(5)).toEqual(Array(6).fill(THEME.airspaceDim));
  });
});
