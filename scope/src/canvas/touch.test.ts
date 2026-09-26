import { describe, expect, it } from 'bun:test';

import { type FingerEvent, type TouchHandlers, trackTouches } from './touch';

const LONG_PRESS_MS = 20;

const finger = (pointerId: number, clientX: number, clientY: number): FingerEvent => ({
  pointerId,
  clientX,
  clientY,
});

/** Handlers that record every call by name, in order. */
function recorder() {
  const calls: [string, ...unknown[]][] = [];
  const h: TouchHandlers = {
    press: (e) => calls.push(['press', e.pointerId]),
    longPress: (at) => calls.push(['longPress', at]),
    pinchStart: (start) => calls.push(['pinchStart', start]),
    pinch: (start, now) => calls.push(['pinch', start, now]),
    pinchEnd: () => calls.push(['pinchEnd']),
  };
  return { calls, t: trackTouches(h, LONG_PRESS_MS) };
}

describe('trackTouches', () => {
  it('presses on the first finger only', () => {
    // Arrange
    const { calls, t } = recorder();

    // Act
    for (const e of [finger(1, 10, 10), finger(2, 50, 50), finger(3, 90, 90)]) t.down(e);

    // Assert
    expect(calls.filter(([name]) => name === 'press')).toEqual([['press', 1]]);
  });

  it('long-presses where a lone finger stays down', async () => {
    // Arrange
    const { calls, t } = recorder();

    // Act
    t.down(finger(1, 10, 20));
    await Bun.sleep(LONG_PRESS_MS * 2);

    // Assert
    expect(calls).toEqual([
      ['press', 1],
      ['longPress', { x: 10, y: 20 }],
    ]);
  });

  it('does not long-press after a lift, a cancel or a second finger', async () => {
    // Arrange
    const interrupts = [
      (t: ReturnType<typeof trackTouches>) => t.up(finger(1, 10, 20)),
      (t: ReturnType<typeof trackTouches>) => t.cancelLongPress(),
      (t: ReturnType<typeof trackTouches>) => t.down(finger(2, 50, 50)),
    ];
    const runs = interrupts.map(() => recorder());
    for (const r of runs) r.t.down(finger(1, 10, 20));

    // Act
    runs.forEach((r, i) => interrupts[i]?.(r.t));
    await Bun.sleep(LONG_PRESS_MS * 2);

    // Assert
    expect(runs.map((r) => r.calls.some(([name]) => name === 'longPress'))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('pinches from where two fingers landed to where they are now', () => {
    // Arrange
    const { calls, t } = recorder();
    t.down(finger(1, 10, 10));
    t.down(finger(2, 50, 50));

    // Act
    const consumed = t.move(finger(2, 70, 60));

    // Assert
    expect(consumed).toBe(true);
    expect(calls.slice(1)).toEqual([
      [
        'pinchStart',
        [
          { x: 10, y: 10 },
          { x: 50, y: 50 },
        ],
      ],
      [
        'pinch',
        [
          { x: 10, y: 10 },
          { x: 50, y: 50 },
        ],
        [
          { x: 10, y: 10 },
          { x: 70, y: 60 },
        ],
      ],
    ]);
  });

  it('ends the pinch, consuming the lift, when either finger lifts', () => {
    // Arrange
    const { calls, t } = recorder();
    t.down(finger(1, 10, 10));
    t.down(finger(2, 50, 50));

    // Act
    const consumed = t.up(finger(1, 10, 10));

    // Assert
    expect(consumed).toBe(true);
    expect(calls.at(-1)).toEqual(['pinchEnd']);
  });

  it('leaves single-finger moves and lifts and foreign pointers to the caller', () => {
    // Arrange
    const { t } = recorder();
    t.down(finger(1, 10, 10));

    // Act
    const consumed = [t.move(finger(1, 30, 30)), t.move(finger(9, 0, 0)), t.up(finger(1, 30, 30))];

    // Assert
    expect(consumed).toEqual([false, false, false]);
  });
});
