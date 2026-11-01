import { describe, expect, it } from 'bun:test';

import type { Track } from '../../state/track';
import { isStale, THEME, trackColor, trackLabel, typeLabel } from './rules';
import { makeTrack as track } from './trackFixture';

describe('isStale', () => {
  it('is stale once its position is as old as the lapse', () => {
    // Arrange
    const cases = [5, 29.9, 30, 30.1].map((seenPos) => track({ seenPos }));

    // Act
    const out = cases.map(isStale);

    // Assert
    expect(out).toEqual([false, false, true, true]);
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
