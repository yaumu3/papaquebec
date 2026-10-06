import { describe, expect, it } from 'bun:test';

import { axisStep, clockLabel, clockStep, ticks } from './axis';

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
