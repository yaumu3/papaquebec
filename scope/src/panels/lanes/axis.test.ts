import { describe, expect, it } from 'bun:test';

import type { LanesWindow } from '../../state/window';
import { axisStep, clearOf, clearOfEnds, clockStep, endLabel, ticks } from './axis';

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
  it('falls on the multiples of the step inside the interval, its ends included', () => {
    // Arrange
    const interval = { from: 1000, to: 1560 };

    // Act
    const at = ticks(interval, 120);

    // Assert
    expect(at).toEqual([1080, 1200, 1320, 1440, 1560]);
  });

  it('falls on whole steps before the origin, so that the grid marks ages', () => {
    // Arrange
    const interval = { from: 1000, to: 1560 };
    const now = 1570;

    // Act
    const at = ticks(interval, 120, now);

    // Assert
    expect(at).toEqual([1090, 1210, 1330, 1450]);
  });

  it('moves with the origin as it grows', () => {
    // Arrange
    const interval = { from: 1000, to: 1560 };

    // Act
    const at = [ticks(interval, 120, 1570), ticks(interval, 120, 1571)];

    // Assert
    expect(at).toEqual([
      [1090, 1210, 1330, 1450],
      [1091, 1211, 1331, 1451],
    ]);
  });
});

describe('endLabel', () => {
  it('reads NOW while live and the lag with a chevron while held', () => {
    // Arrange
    const live: LanesWindow = { kind: 'live', sec: 300 };
    const held: LanesWindow = { kind: 'held', from: 1000, to: 1300 };

    // Act
    const labels = [endLabel(live, 0), endLabel(held, 200)];

    // Assert
    expect(labels).toEqual([
      { text: 'NOW', held: false },
      { text: '−03:20 ›', held: true },
    ]);
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

describe('clearOf', () => {
  it('tells which labels miss the end label', () => {
    // Arrange
    const xs = [60, 180, 230, 300];

    // Act
    const clear = clearOf(xs, 240, 300, 15);

    // Assert
    expect(clear).toEqual([true, true, false, false]);
  });
});
