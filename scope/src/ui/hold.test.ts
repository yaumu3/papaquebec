import { describe, expect, it } from 'bun:test';

import { createHold } from './hold';

function fakeTimers() {
  const pending = new Map<number, { ms: number; fn: () => void }>();
  const cleared: number[] = [];
  let next = 1;
  return {
    pending,
    cleared,
    set(fn: () => void, ms: number) {
      pending.set(next, { ms, fn });
      return next++;
    },
    clear(id: number) {
      cleared.push(id);
      pending.delete(id);
    },
  };
}

describe('createHold', () => {
  it('is off before it is lit', () => {
    // Arrange
    const hold = createHold(fakeTimers());

    // Act
    const lit = hold.lit();

    // Assert
    expect(lit).toBe(false);
  });

  it('is lit for the time it is held', () => {
    // Arrange
    const timers = fakeTimers();
    const hold = createHold(timers);

    // Act
    hold.hold(1500);

    // Assert
    expect([hold.lit(), [...timers.pending.values()].map((t) => t.ms)]).toEqual([true, [1500]]);
  });

  it('goes off when the time is up', () => {
    // Arrange
    const timers = fakeTimers();
    const hold = createHold(timers);
    hold.hold(1500);

    // Act
    for (const { fn } of timers.pending.values()) fn();

    // Assert
    expect(hold.lit()).toBe(false);
  });

  it('starts the time over when it is held again', () => {
    // Arrange
    const timers = fakeTimers();
    const hold = createHold(timers);
    hold.hold(1500);

    // Act
    hold.hold(1000);

    // Assert
    expect([
      timers.cleared,
      [...timers.pending.entries()].map(([id, t]) => [id, t.ms]),
      hold.lit(),
    ]).toEqual([[1], [[2, 1000]], true]);
  });

  it('goes off when the second time is up', () => {
    // Arrange
    const timers = fakeTimers();
    const hold = createHold(timers);
    hold.hold(1500);
    hold.hold(1000);

    // Act
    for (const { fn } of timers.pending.values()) fn();

    // Assert
    expect(hold.lit()).toBe(false);
  });

  it('drops the pending time and goes off', () => {
    // Arrange
    const timers = fakeTimers();
    const hold = createHold(timers);
    hold.hold(1500);

    // Act
    hold.drop();

    // Assert
    expect([hold.lit(), timers.cleared, timers.pending.size]).toEqual([false, [1], 0]);
  });
});
