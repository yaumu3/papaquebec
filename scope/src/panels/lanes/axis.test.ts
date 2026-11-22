import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import type { LanesWindow } from '../../state/window';
import { axisStep, chipAt, clearOf, clearOfEnds, clockStep, endLabel, ticks } from './axis';

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
  it('falls on every whole step from the origin inside the interval, its ends included, and nowhere else', () => {
    // Arrange: whole seconds, an origin before, inside or after the interval
    const anyInterval = fc
      .tuple(fc.integer({ min: 0, max: 5000 }), fc.nat(600))
      .map(([from, length]) => ({ from, to: from + length }));
    const anyStep = fc.integer({ min: 1, max: 300 });
    const anyOrigin = fc.integer({ min: -1000, max: 7000 });

    fc.assert(
      fc.property(anyInterval, anyStep, anyOrigin, (interval, step, origin) => {
        // Act
        const at = ticks(interval, step, origin);

        // Assert
        const inside = Array.from(
          { length: interval.to - interval.from + 1 },
          (_, k) => interval.from + k,
        );
        expect(at).toEqual(inside.filter((t) => (t - origin) % step === 0));
      }),
    );
  });

  it('counts from zero without an origin', () => {
    // Arrange
    const interval = { from: 1000, to: 1560 };

    // Act
    const at = ticks(interval, 120);

    // Assert
    expect(at).toEqual([1080, 1200, 1320, 1440, 1560]);
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

const doubled = (t: number) => t * 2;

describe('clearOfEnds', () => {
  it('keeps the ticks a mark reaching round each fits whole inside the plot at', () => {
    // Arrange
    const at = [0, 10, 50, 90, 100];

    // Act
    const kept = clearOfEnds(at, doubled, 200, 20);

    // Assert
    expect(kept).toEqual([10, 50, 90]);
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
  it('tells which labels miss the end label', () => {
    // Arrange
    const xs = [60, 180, 230, 300];

    // Act
    const clear = clearOf(xs, 240, 300, 15);

    // Assert
    expect(clear).toEqual([true, true, false, false]);
  });
});
