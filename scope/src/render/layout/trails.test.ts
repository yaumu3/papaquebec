import { describe, expect, it } from 'bun:test';

import type { Fix } from '../../state/track';
import { decimateTrail, TRAIL_DECIMATION_SEC, TRAIL_TARGET_GAP_SEC } from './trails';

function fixes(times: number[]): Fix[] {
  return times.map((t) => ({ lat: 0, lon: 0, x: t, y: 0, t, alt: undefined }));
}

describe('decimateTrail', () => {
  it('emits one fix per decimation slot of the clock, newest first, within the window', () => {
    // Arrange
    const history = fixes([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    const now = 20;
    const windowSec = 60;

    // Act
    const out = decimateTrail(history, now, windowSec);

    // Assert
    expect(out.map((f) => f.t)).toEqual([2 * TRAIL_DECIMATION_SEC, TRAIL_DECIMATION_SEC, 0]);
    expect(out.every((f) => f.t <= now - TRAIL_TARGET_GAP_SEC)).toBe(true);
  });

  it('keeps the same marks as time passes, only adding new ones and dropping stale ones', () => {
    // Arrange
    const history = fixes(Array.from({ length: 41 }, (_, i) => i));

    // Act
    const earlier = decimateTrail(history, 30, 60);
    const later = decimateTrail(history, 40, 60);

    // Assert
    expect(later.slice(later.length - earlier.length)).toEqual(earlier);
    expect(later.length).toBeGreaterThan(earlier.length);
  });

  it('drops the oldest mark whole once its slot starts before the window, never shifting it', () => {
    // Arrange
    const history = fixes(Array.from({ length: 41 }, (_, i) => i));

    // Act
    const midSlot = decimateTrail(history, 45, 40);
    const onEdge = decimateTrail(history, 48, 40);

    // Assert
    expect(midSlot.at(-1)?.t).toBe(TRAIL_DECIMATION_SEC);
    expect(onEdge.at(-1)?.t).toBe(TRAIL_DECIMATION_SEC);
  });

  it('stops at the window edge', () => {
    // Arrange
    const history = fixes([0, 10, 20, 30, 40, 50, 60]);
    const now = 60;

    // Act
    const out = decimateTrail(history, now, 30);

    // Assert
    expect(out.every((f) => f.t >= 30)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
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
