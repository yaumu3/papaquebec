import { describe, expect, it } from 'bun:test';

import {
  type Area,
  consumes,
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
    const scrolling: WheelGesture = { meaning: 'scroll', at: 1000 };
    const zooming: WheelGesture = { meaning: 'zoom', at: 1000 };
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
    const scrolling: WheelGesture = { meaning: 'scroll', at: 1000 };
    const late = 1000 + WHEEL_GAP_MS + 1;

    // Act
    const next = wheelGestureOf(scrolling, evt({ area: 'plot', at: late }));

    // Assert
    expect(next).toEqual({ meaning: 'zoom', at: late });
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
  it('takes zoom and pan, not scroll', () => {
    // Arrange
    const meanings = ['zoom', 'pan', 'scroll'] as const;

    // Act
    const taken = meanings.map(consumes);

    // Assert
    expect(taken).toEqual([true, true, false]);
  });
});
