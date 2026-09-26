import { describe, expect, it } from 'bun:test';

import { type FingerEvent, type TouchHandlers, trackTouches } from './touch';

const LONG_PRESS_MS = 20;

const finger = (
  pointerId: number,
  clientX: number,
  clientY: number,
  timeStamp = 0,
): FingerEvent => ({
  pointerId,
  clientX,
  clientY,
  timeStamp,
});

/** Handlers that record every call by name, in order. */
function recorder() {
  const calls: [string, ...unknown[]][] = [];
  const h: TouchHandlers = {
    press: (e) => calls.push(['press', e.pointerId]),
    longPress: (at) => calls.push(['longPress', at]),
    zoomStart: () => calls.push(['zoomStart']),
    zoom: (anchor, factor, to) => calls.push(['zoom', anchor, factor, to]),
    zoomEnd: () => calls.push(['zoomEnd']),
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

  it('long-presses through a wobble, but not a lift, a drag or a second finger', async () => {
    // Arrange
    const interrupts = [
      (t: ReturnType<typeof trackTouches>) => t.up(finger(1, 10, 20)),
      (t: ReturnType<typeof trackTouches>) => t.move(finger(1, 30, 20)),
      (t: ReturnType<typeof trackTouches>) => t.down(finger(2, 50, 50)),
      (t: ReturnType<typeof trackTouches>) => t.move(finger(1, 13, 20)),
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
      true,
    ]);
  });

  it('zooms by the change in finger spread, following their midpoint', () => {
    // Arrange
    const { calls, t } = recorder();
    t.down(finger(1, 100, 100));
    t.down(finger(2, 200, 100));

    // Act
    const consumed = t.move(finger(2, 300, 100));

    // Assert
    expect(consumed).toBe(true);
    expect(calls.slice(1)).toEqual([
      ['zoomStart'],
      ['zoom', { x: 150, y: 100 }, 0.5, { x: 200, y: 100 }],
    ]);
  });

  it('ends the zoom, consuming the lift, when either finger lifts', () => {
    // Arrange
    const { calls, t } = recorder();
    t.down(finger(1, 10, 10));
    t.down(finger(2, 50, 50));

    // Act
    const consumed = t.up(finger(1, 10, 10));

    // Assert
    expect(consumed).toBe(true);
    expect(calls.at(-1)).toEqual(['zoomEnd']);
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

  it('drag-zooms about the tap when a finger lands soon after it and slides', () => {
    // Arrange
    const { calls, t } = recorder();
    t.down(finger(1, 100, 200, 0));
    t.up(finger(1, 100, 200, 60));
    t.down(finger(2, 105, 195, 180));

    // Act
    t.move(finger(2, 105, 135, 220));

    // Assert
    expect(calls.slice(1)).toEqual([
      ['zoomStart'],
      ['zoom', { x: 105, y: 195 }, 2 ** (-60 / 150), { x: 105, y: 195 }],
    ]);
  });

  it('ends the drag zoom when the finger lifts', () => {
    // Arrange
    const { calls, t } = recorder();
    t.down(finger(1, 100, 200, 0));
    t.up(finger(1, 100, 200, 60));
    t.down(finger(2, 100, 200, 180));
    t.move(finger(2, 100, 260, 220));

    // Act
    t.up(finger(2, 100, 260, 260));

    // Assert
    expect(calls.at(-1)).toEqual(['zoomEnd']);
  });

  it('treats an unmoved second touch as neither a press nor a drag zoom', () => {
    // Arrange
    const { calls, t } = recorder();
    t.down(finger(1, 100, 200, 0));
    t.up(finger(1, 100, 200, 60));
    t.down(finger(2, 100, 200, 180));

    // Act
    t.up(finger(2, 100, 200, 240));

    // Assert
    expect(calls).toEqual([['press', 1]]);
  });

  it('does not drag-zoom after a slow second touch or a first touch that moved', () => {
    // Arrange
    const cases = [
      { liftX: 100, secondAt: 600 },
      { liftX: 130, secondAt: 180 },
    ];
    const runs = cases.map(() => recorder());
    cases.forEach((c, i) => {
      const t = runs[i]?.t;
      t?.down(finger(1, 100, 200, 0));
      t?.move(finger(1, c.liftX, 200, 30));
      t?.up(finger(1, c.liftX, 200, 60));
      t?.down(finger(2, 100, 200, c.secondAt));
    });

    // Act
    cases.forEach((c, i) => runs[i]?.t.move(finger(2, 100, 140, c.secondAt + 40)));

    // Assert
    expect(runs.map((r) => r.calls.some(([name]) => name === 'zoomStart'))).toEqual([false, false]);
  });

  it('does not drag-zoom when another touch came between the tap and the second touch', () => {
    // Arrange
    const { calls, t } = recorder();
    t.down(finger(1, 100, 200, 0));
    t.up(finger(1, 100, 200, 60));
    t.down(finger(2, 300, 400, 100));
    t.move(finger(2, 340, 400, 120));
    t.up(finger(2, 340, 400, 140));
    t.down(finger(3, 100, 200, 200));

    // Act
    t.move(finger(3, 100, 140, 240));

    // Assert
    expect(calls.some(([name]) => name === 'zoomStart')).toBe(false);
  });

  it('does not drag-zoom after a long press', async () => {
    // Arrange
    const { calls, t } = recorder();
    t.down(finger(1, 100, 200, 0));
    await Bun.sleep(LONG_PRESS_MS * 2);
    t.up(finger(1, 100, 200, 60));
    t.down(finger(2, 100, 200, 180));

    // Act
    t.move(finger(2, 100, 140, 220));

    // Assert
    expect(calls.some(([name]) => name === 'zoomStart')).toBe(false);
  });

  it('ends a drag zoom and pinches when a second finger lands', () => {
    // Arrange
    const { calls, t } = recorder();
    t.down(finger(1, 100, 200, 0));
    t.up(finger(1, 100, 200, 60));
    t.down(finger(2, 100, 200, 180));
    t.move(finger(2, 100, 260, 220));

    // Act
    t.down(finger(3, 200, 200, 260));

    // Assert
    expect(calls.slice(-2).map(([name]) => name)).toEqual(['zoomEnd', 'zoomStart']);
  });
  it('is zooming from the second touch of a double tap until that finger lifts', () => {
    // Arrange
    const steps: ((t: ReturnType<typeof trackTouches>) => void)[] = [
      (t) => t.down(finger(1, 100, 200, 0)),
      (t) => t.up(finger(1, 100, 200, 60)),
      (t) => t.down(finger(2, 100, 200, 180)),
      (t) => t.up(finger(2, 100, 200, 240)),
    ];
    const { t } = recorder();

    // Act
    const zooming = steps.map((step) => {
      step(t);
      return t.zooming();
    });

    // Assert
    expect(zooming).toEqual([false, false, true, false]);
  });
});
