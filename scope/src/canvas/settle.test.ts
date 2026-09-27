import { describe, expect, it } from 'bun:test';

import { debounce, type Timer } from './settle';

/** Timers that fire only when the test advances the clock. */
function fakeTimer() {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; fn: () => void }>();
  const timer: Timer = {
    set: (fn, ms) => {
      due.set(next, { at: now + ms, fn });
      return next++;
    },
    clear: (id) => due.delete(id),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, entry] of [...due].filter(([, e]) => e.at <= now)) {
      due.delete(id);
      entry.fn();
    }
  };
  return { timer, advance };
}

describe('debounce', () => {
  it('applies only the latest value, once it has held for the delay', () => {
    // Arrange
    const clock = fakeTimer();
    const seen: number[] = [];
    const push = debounce(150, (v: number) => seen.push(v), clock.timer);
    push(1);
    clock.advance(100);
    push(2);

    // Act
    clock.advance(150);

    // Assert
    expect(seen).toEqual([2]);
  });

  it('restarts the wait with every new value', () => {
    // Arrange
    const clock = fakeTimer();
    const seen: number[] = [];
    const push = debounce(150, (v: number) => seen.push(v), clock.timer);
    push(1);
    clock.advance(100);
    push(2);

    // Act
    clock.advance(100);

    // Assert
    expect(seen).toEqual([]);
  });
});
