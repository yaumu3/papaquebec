import { describe, expect, it } from 'bun:test';

import {
  type Glide,
  GLIDE_MS,
  glideAt,
  type Point,
  type PointGlides,
  retargetGlide,
  retargetPoints,
} from './glide';

const T0 = 5000;

describe('glideAt', () => {
  it('runs from its start to its end at one pace, and stays there', () => {
    // Arrange
    const glide: Glide = { from: 100, to: 140, startedAt: T0 };
    const times = [T0, T0 + GLIDE_MS / 4, T0 + GLIDE_MS / 2, T0 + GLIDE_MS, T0 + 2 * GLIDE_MS];

    // Act
    const at = times.map((now) => glideAt(glide, now));

    // Assert
    expect(at).toEqual([100, 110, 120, 140, 140]);
  });

  it('takes an angle the short way round, and keeps it on the circle', () => {
    // Arrange
    const glide: Glide = { from: 350, to: 10, startedAt: T0 };
    const times = [T0, T0 + GLIDE_MS / 4, T0 + GLIDE_MS / 2, T0 + GLIDE_MS];

    // Act
    const at = times.map((now) => glideAt(glide, now, 360));

    // Assert
    expect(at).toEqual([350, 355, 0, 10]);
  });
});

describe('retargetGlide', () => {
  it('stands at once on a value with none shown before it', () => {
    // Act
    const glide = retargetGlide(undefined, 250, T0);

    // Assert
    expect(glide).toEqual({ from: 250, to: 250, startedAt: T0 });
  });

  it('shows nothing when there is nothing to show', () => {
    // Arrange
    const current: Glide = { from: 100, to: 140, startedAt: T0 };

    // Act
    const glide = retargetGlide(current, undefined, T0 + GLIDE_MS / 2);

    // Assert
    expect(glide).toBeUndefined();
  });

  it('carries on with a glide that already heads for the value', () => {
    // Arrange
    const current: Glide = { from: 100, to: 140, startedAt: T0 };

    // Act
    const glide = retargetGlide(current, 140, T0 + GLIDE_MS / 2);

    // Assert
    expect(glide).toBe(current);
  });

  it('sets off for a new value from where the reading stands', () => {
    // Arrange
    const current: Glide = { from: 100, to: 140, startedAt: T0 };

    // Act
    const glide = retargetGlide(current, 200, T0 + GLIDE_MS / 2);

    // Assert
    expect(glide).toEqual({ from: 120, to: 200, startedAt: T0 + GLIDE_MS / 2 });
  });

  it('sets off from where an angle stands on the circle', () => {
    // Arrange
    const current: Glide = { from: 350, to: 10, startedAt: T0 };

    // Act
    const glide = retargetGlide(current, 90, T0 + GLIDE_MS / 2, 360);

    // Assert
    expect(glide).toEqual({ from: 0, to: 90, startedAt: T0 + GLIDE_MS / 2 });
  });
});

describe('retargetPoints', () => {
  it('keeps each key on its way, starts a new key in place and drops a key gone', () => {
    // Arrange
    const now = T0 + GLIDE_MS / 2;
    const still = { from: 5, to: 5, startedAt: T0 };
    const current = new Map<string, PointGlides>([
      [
        'a',
        [
          { from: 0, to: 40, startedAt: T0 },
          { from: 0, to: 80, startedAt: T0 },
        ],
      ],
      ['b', [still, still]],
      ['gone', [still, { from: 1, to: 2, startedAt: T0 }]],
    ]);
    const targets = new Map<string, Point>([
      ['a', [40, 100]],
      ['b', [5, 5]],
      ['new', [7, 8]],
    ]);

    // Act
    const next = retargetPoints(current, targets, now);

    // Assert
    expect([...next.keys()]).toEqual(['a', 'b', 'new']);
    expect(next.get('a')).toEqual([
      { from: 0, to: 40, startedAt: T0 },
      { from: 40, to: 100, startedAt: now },
    ]);
    expect(next.get('b')).toBe(current.get('b'));
    expect(next.get('new')).toEqual([
      { from: 7, to: 7, startedAt: now },
      { from: 8, to: 8, startedAt: now },
    ]);
  });
});
