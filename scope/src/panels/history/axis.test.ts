import { describe, expect, it } from 'bun:test';

import {
  axisStep,
  chipAt,
  clearOf,
  clockLabel,
  clockStep,
  clearOfEnds,
  spanLabel,
  ticks,
} from './axis';

/** 12:36:10Z on the first day of the epoch. */
const T = 12 * 3600 + 36 * 60 + 10;

describe('axisStep', () => {
  it('takes the shortest step that labels a span a few times over', () => {
    // Arrange
    const spans = [60, 600, 1380, 3600];

    // Act
    const steps = spans.map(axisStep);

    // Assert
    expect(steps).toEqual([15, 120, 300, 900]);
  });
});

describe('clockStep', () => {
  it('takes the shortest round step that falls at most so many times across the span', () => {
    // Arrange
    const cases: [number, number][] = [
      [3600, 5],
      [3600, 9],
      [60, 9],
    ];

    // Act
    const steps = cases.map(([span, most]) => clockStep(span, most));

    // Assert
    expect(steps).toEqual([900, 600, 10]);
  });
});

describe('ticks', () => {
  it('falls on the round clock times inside the interval, its ends included', () => {
    // Arrange
    const interval = { from: 1000, to: 1560 };

    // Act
    const at = ticks(interval, 120);

    // Assert
    expect(at).toEqual([1080, 1200, 1320, 1440, 1560]);
  });
});

describe('clockLabel', () => {
  it('reads to the minute, and to the second once the step is shorter than one', () => {
    // Arrange
    const minute = T - 10;

    // Act
    const labels = [clockLabel(minute, 120), clockLabel(T, 30)];

    // Assert
    expect(labels).toEqual(['12:36', '12:36:10']);
  });
});

describe('clearOfEnds', () => {
  it('keeps the ticks a mark reaching round each fits whole inside the plot at', () => {
    // Arrange
    const at = [0, 10, 50, 90, 100];
    const x = (t: number) => t * 2;

    // Act
    const kept = clearOfEnds(at, x, 200, 20);

    // Assert
    expect(kept).toEqual([10, 50, 90]);
  });
});

describe('spanLabel', () => {
  it('reads the ends of the span as its axis does, then how long it is', () => {
    // Arrange
    const spans = [
      { from: T - 10 - 7 * 60, to: T - 10 - 2 * 60 },
      { from: T, to: T + 90 },
      { from: T, to: T + 40 },
    ];

    // Act
    const labels = spans.map(spanLabel);

    // Assert
    expect(labels).toEqual([
      '12:29 – 12:34 · 5 MIN',
      '12:36:10 – 12:37:40 · 2 MIN',
      '12:36:10 – 12:36:50 · 40 S',
    ]);
  });
});

describe('chipAt', () => {
  it('centres the chip on the cursor, kept inside the plot', () => {
    // Arrange
    const xs = [150, 10, 295];

    // Act
    const lefts = xs.map((x) => chipAt(x, 60, 300));

    // Assert
    expect(lefts).toEqual([120, 0, 240]);
  });
});

describe('clearOf', () => {
  it('tells which labels miss the chip', () => {
    // Arrange
    const xs = [60, 180, 230, 300];

    // Act
    const clear = clearOf(xs, 240, 300, 15);

    // Assert
    expect(clear).toEqual([true, true, false, false]);
  });
});
