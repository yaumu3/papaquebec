import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import type { Point } from '../svg';
import {
  type Glide,
  GLIDE_MS,
  glideAt,
  type PointGlides,
  retargetGlide,
  retargetPoints,
} from './glide';

const T0 = 5000;

describe('glideAt', () => {
  it('runs from its start to its end at one pace, and stays there', () => {
    // Arrange: whole values, which a glide lands on exactly
    const anyValue = fc.integer({ min: -1000, max: 1000 });
    const anyGlide = fc.record({ from: anyValue, to: anyValue, startedAt: fc.nat(100_000) });
    const anyShare = fc.integer({ min: 0, max: 1000 }).map((n) => n / 1000);
    const anyWait = fc.nat(5000);

    fc.assert(
      fc.property(anyGlide, anyShare, anyShare, anyWait, anyWait, (glide, p, q, early, late) => {
        // Arrange: before it starts, two instants on the way and the one midway, after it ends
        const on = (share: number) => glide.startedAt + share * GLIDE_MS;
        const times = [on(0) - early, on(p), on((p + q) / 2), on(q), on(1) + late];

        // Act
        const at = times.map((now) => glideAt(glide, now));

        // Assert
        const [before = NaN, first = NaN, midway = NaN, second = NaN, after = NaN] = at;
        expect([before, after]).toEqual([glide.from, glide.to]);
        expect(midway).toBeCloseTo((first + second) / 2, 6);
      }),
    );
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

  it('sets off for a new value from where the reading stands, on the circle too, and carries on with a glide that already heads for it', () => {
    // Arrange: whole degrees, a value or an angle alike
    const anyValue = fc.integer({ min: 0, max: 359 });
    const anyGlide = fc.record({ from: anyValue, to: anyValue, startedAt: fc.nat(100_000) });
    const anyElapsed = fc.nat(1.5 * GLIDE_MS);
    const anyWrap = fc.constantFrom(undefined, 360);

    fc.assert(
      fc.property(
        anyGlide,
        fc.option(anyValue, { nil: undefined }),
        anyElapsed,
        anyWrap,
        (current, other, elapsed, wrap) => {
          // Arrange
          const now = current.startedAt + elapsed;
          const to = other ?? current.to;

          // Act
          const glide = retargetGlide(current, to, now, wrap);

          // Assert
          const heads = to === current.to;
          expect(glide === current).toBe(heads);
          expect(glide?.to).toBe(to);
          expect(glide?.startedAt).toBe(heads ? current.startedAt : now);
          expect(glideAt(glide ?? current, now, wrap)).toBeCloseTo(glideAt(current, now, wrap), 9);
        },
      ),
    );
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
