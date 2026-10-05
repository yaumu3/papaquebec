import { describe, expect, it } from 'bun:test';

import type { Track } from '../../state/track';
import { Shape } from '../protocol';
import {
  airspaceColor,
  isStale,
  targetShape,
  THEME,
  trackColor,
  trackLabel,
  typeLabel,
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
      [track({ squawk: '7700' }), 'd00001'],
      [track(), 'd00001'],
      [track({ seenPos: 60 }), null],
      [track({ alt: 'ground', verticalRate: 1500 }), null],
      [track({ verticalRate: 1500 }), null],
      [track({ verticalRate: -1500 }), null],
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
      track({ flight: undefined, registration: 'TEST-02' }),
      track({ flight: undefined, registration: undefined }),
    ];

    // Act
    const labels = cases.map(trackLabel);

    // Assert
    expect(labels).toEqual(['TEST01', 'TEST-02', 'D00001']);
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

describe('typeLabel', () => {
  it('names the type, else brackets the category, else brackets dashes', () => {
    // Arrange
    const cases = [
      track({ type: 'B789', category: 'A3' }),
      track({ type: undefined, category: 'A3' }),
      track({ type: undefined, category: undefined }),
    ];

    // Act
    const labels = cases.map(typeLabel);

    // Assert
    expect(labels).toEqual(['B789', '[A3]', '[--]']);
  });
});
