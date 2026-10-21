import { describe, expect, it } from 'bun:test';

import {
  type Area,
  consumes,
  gestureFactor,
  type WheelEvt,
  type WheelMeaning,
  WHEEL_GAP_MS,
  wheelGestureOf,
  type WheelGesture,
  wheelPx,
  panDelta,
} from './wheel';

const evt = (over: Partial<WheelEvt>): WheelEvt => ({
  area: 'plot',
  dx: 0,
  dy: 100,
  shift: false,
  ctrl: false,
  at: 1000,
  ...over,
});

describe('wheelPx', () => {
  it('reads pixels as they are, lines and pages scaled to pixels', () => {
    // Arrange
    const rows: [number, number][] = [
      [10, 0],
      [3, 1],
      [1, 2],
    ];

    // Act
    const px = rows.map(([delta, mode]) => wheelPx(delta, mode));

    // Assert
    expect(px[0]).toBe(10);
    expect(px[1]).toBeGreaterThan(3);
    expect(px[2]).toBeGreaterThan(px[1] ?? 0);
  });
});

describe('wheelGestureOf', () => {
  it('decides a first event by where it is and which way it moves', () => {
    // Arrange
    const rows: { e: WheelEvt; meaning: WheelMeaning }[] = [
      { e: evt({ dy: 100 }), meaning: 'zoom' },
      { e: evt({ dy: 100, area: 'axis' }), meaning: 'zoom' },
      { e: evt({ dx: 60, dy: 0 }), meaning: 'pan' },
      { e: evt({ dx: 60, dy: 5 }), meaning: 'pan' },
      { e: evt({ dy: 100, shift: true }), meaning: 'pan' },
      { e: evt({ dx: 100, dy: 0, shift: true }), meaning: 'pan' },
      ...(['gutter', 'row', 'other'] as Area[]).map((area) => ({
        e: evt({ area }),
        meaning: 'scroll' as const,
      })),
    ];

    // Act
    const meanings = rows.map((r) => wheelGestureOf(null, r.e).meaning);

    // Assert
    expect(meanings).toEqual(rows.map((r) => r.meaning));
  });

  it('keeps the meaning a gesture began with while the events follow within the gap', () => {
    // Arrange
    const scrolling: WheelGesture = { meaning: 'scroll', at: 1000, ctrl: false };
    const zooming: WheelGesture = { meaning: 'zoom', at: 1000, ctrl: false };
    const soon = 1000 + WHEEL_GAP_MS;

    // Act
    const meanings = [
      wheelGestureOf(scrolling, evt({ area: 'plot', at: soon })).meaning,
      wheelGestureOf(zooming, evt({ area: 'gutter', at: soon })).meaning,
      wheelGestureOf(zooming, evt({ dx: 80, dy: 0, at: soon })).meaning,
    ];

    // Assert
    expect(meanings).toEqual(['scroll', 'zoom', 'zoom']);
  });

  it('decides afresh after the gap', () => {
    // Arrange
    const scrolling: WheelGesture = { meaning: 'scroll', at: 1000, ctrl: false };
    const late = 1000 + WHEEL_GAP_MS + 1;

    // Act
    const next = wheelGestureOf(scrolling, evt({ area: 'plot', at: late }));

    // Assert
    expect(next).toEqual({ meaning: 'zoom', at: late, ctrl: false });
  });
});

describe('wheelGestureOf with ctrl', () => {
  it('is a pinch over a plot or the axis, and left to the page elsewhere', () => {
    // Arrange
    const areas: Area[] = ['plot', 'axis', 'gutter', 'row', 'other'];

    // Act
    const meanings = areas.map((area) => wheelGestureOf(null, evt({ area, ctrl: true })).meaning);

    // Assert
    expect(meanings).toEqual(['pinch', 'pinch', 'scroll', 'scroll', 'scroll']);
  });

  it('starts afresh when ctrl changes inside the gap', () => {
    // Arrange
    const zooming: WheelGesture = { meaning: 'zoom', at: 1000, ctrl: false };
    const pinching: WheelGesture = { meaning: 'pinch', at: 1000, ctrl: true };

    // Act
    const next = [
      wheelGestureOf(zooming, evt({ ctrl: true, at: 1050 })),
      wheelGestureOf(pinching, evt({ ctrl: false, at: 1050 })),
    ];

    // Assert
    expect(next.map((g) => g.meaning)).toEqual(['pinch', 'zoom']);
  });

  it('keeps a pinch going while the ctrl events follow within the gap', () => {
    // Arrange
    const pinching: WheelGesture = { meaning: 'pinch', at: 1000, ctrl: true };

    // Act
    const next = wheelGestureOf(pinching, evt({ area: 'gutter', ctrl: true, at: 1050 }));

    // Assert
    expect(next).toEqual({ meaning: 'pinch', at: 1050, ctrl: true });
  });
});

describe('gestureFactor', () => {
  it('narrows the window as the fingers spread and widens it as they close', () => {
    // Arrange
    const rows = [
      { prev: 1, scale: 2 },
      { prev: 1, scale: 0.5 },
      { prev: 2, scale: 2 },
    ];

    // Act
    const factors = rows.map((r) => gestureFactor(r.prev, r.scale));

    // Assert
    expect(factors).toEqual([0.5, 2, 1]);
  });
});

describe('panDelta', () => {
  it('is the sideways delta, or the vertical one when shift turns it sideways', () => {
    // Arrange
    const rows = [
      evt({ dx: 60, dy: 5 }),
      evt({ dx: 0, dy: 100, shift: true }),
      evt({ dx: 7, dy: 100, shift: true }),
    ];

    // Act
    const deltas = rows.map(panDelta);

    // Assert
    expect(deltas).toEqual([60, 100, 7]);
  });
});

describe('consumes', () => {
  it('takes zoom, pan and pinch, not scroll', () => {
    // Arrange
    const meanings = ['zoom', 'pan', 'pinch', 'scroll'] as const;

    // Act
    const taken = meanings.map(consumes);

    // Assert
    expect(taken).toEqual([true, true, true, false]);
  });
});
