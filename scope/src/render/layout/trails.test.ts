import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import type { Fix } from '../../state/track';
import { decimateTrail, fixNearest, TRAIL_DECIMATION_SEC, TRAIL_TARGET_GAP_SEC } from './trails';

function fixes(times: number[]): Fix[] {
  return times.map((t) => ({ lat: 0, lon: 0, x: t, y: 0, t, alt: undefined }));
}

/** The decimation slot of the clock a fix falls in. */
const slotOf = (f: Fix) => Math.floor(f.t / TRAIL_DECIMATION_SEC);

/** A history in whole seconds a few apart, so that a slot often holds several fixes and straddles an edge. */
const anyHistory = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 10, maxLength: 60 })
  .map((gaps) => fixes(gaps.map((_, i) => gaps.slice(0, i + 1).reduce((t, gap) => t + gap, 0))));

describe('decimateTrail', () => {
  it('emits one fix per decimation slot of the clock, newest first, within the window', () => {
    // Arrange
    const anyNow = fc.integer({ min: 0, max: 100 });
    const anyWindow = fc.integer({ min: 0, max: 60 });

    fc.assert(
      fc.property(anyHistory, anyNow, anyWindow, (history, now, windowSec) => {
        // Act
        const out = decimateTrail(history, now, windowSec);

        // Assert: the first fix of each slot, as long as that one is in the window and clear of the target
        const firsts = history.filter(
          (f, i) => history.findIndex((g) => slotOf(g) === slotOf(f)) === i,
        );
        const marked = firsts.filter(
          (f) => f.t >= now - windowSec && f.t <= now - TRAIL_TARGET_GAP_SEC,
        );
        expect(out).toEqual(marked.toReversed());
      }),
    );
  });

  it('keeps the same marks as time passes, only adding new ones and dropping stale ones', () => {
    // Arrange
    const anyTimes = fc
      .tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 40 }))
      .map(([now, passed]) => [now, now + passed] as const);
    const anyWindow = fc.integer({ min: 0, max: 60 });

    fc.assert(
      fc.property(anyHistory, anyTimes, anyWindow, (history, [earlier, later], windowSec) => {
        // Act
        const [before = [], after = []] = [earlier, later].map((now) =>
          decimateTrail(history, now, windowSec),
        );

        // Assert: a slot marked before is marked by the same fix after, or not at all
        const slots = new Set(before.map(slotOf));
        const stillInWindow = before.filter((f) => f.t >= later - windowSec);
        expect(after.filter((f) => slots.has(slotOf(f)))).toEqual(stillInWindow);
      }),
    );
  });

  it('returns nothing for a window of zero', () => {
    // Arrange
    const history = fixes([0, 10, 20]);

    // Act
    const out = decimateTrail(history, 20, 0);

    // Assert
    expect(out).toEqual([]);
  });
});

describe('fixNearest', () => {
  it('finds the fix nearest an instant, unless the nearest lies more than a slot away', () => {
    // Arrange
    const history = fixes([100, 110, 120]);

    // Act
    const found = [fixNearest(history, 113), fixNearest(history, 120 + TRAIL_DECIMATION_SEC + 1)];

    // Assert
    expect(found.map((f) => f?.t)).toEqual([110, undefined]);
  });
});
