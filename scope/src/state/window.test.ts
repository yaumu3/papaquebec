import { describe, expect, it } from 'bun:test';

import {
  DEFAULT_WINDOW,
  type Interval,
  type LanesWindow,
  MIN_WINDOW_SEC,
  readsPast,
  resolveWindow,
  timeAt,
  xOf,
} from './window';

/** A contact of ten minutes. */
const CONTACT: Interval = { from: 1000, to: 1600 };

describe('resolveWindow', () => {
  it('shows the whole of a long contact by default', () => {
    // Arrange
    const long: Interval = { from: 0, to: 1600 };

    // Act
    const visible = resolveWindow(DEFAULT_WINDOW, long);

    // Assert
    expect(visible).toEqual(long);
  });

  it('shows the whole of a contact shorter than the window', () => {
    // Arrange
    const brief: Interval = { from: 1500, to: 1600 };

    // Act
    const visible = resolveWindow({ kind: 'live', sec: 300 }, brief);

    // Assert
    expect(visible).toEqual(brief);
  });

  it('shows the minimum window ending now for a contact shorter than that', () => {
    // Arrange
    const brief: Interval = { from: 1590, to: 1600 };

    // Act
    const visible = resolveWindow(DEFAULT_WINDOW, brief);

    // Assert
    expect(visible).toEqual({ from: 1600 - MIN_WINDOW_SEC, to: 1600 });
  });

  it('keeps an unbounded window whole as the contact grows', () => {
    // Arrange
    const whole: LanesWindow = { kind: 'live', sec: Infinity };
    const grown: Interval = { from: 1000, to: 1700 };

    // Act
    const visible = [resolveWindow(whole, CONTACT), resolveWindow(whole, grown)];

    // Assert
    expect(visible).toEqual([CONTACT, grown]);
  });

  it('keeps a held window inside the contact as it is', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 1100, to: 1300 };

    // Act
    const visible = resolveWindow(held, CONTACT);

    // Assert
    expect(visible).toEqual({ from: 1100, to: 1300 });
  });

  it('slides a held window the contact has moved past to the start of the contact, keeping its length', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 900, to: 1030 };

    // Act
    const visible = resolveWindow(held, CONTACT);

    // Assert
    expect(visible).toEqual({ from: 1000, to: 1130 });
  });
});

describe('xOf and timeAt', () => {
  it('map a time across the width and back', () => {
    // Arrange
    const visible: Interval = { from: 1000, to: 1200 };

    // Act
    const [x, t] = [xOf(1050, visible, 300), timeAt(75, visible, 300)];

    // Assert
    expect([x, t]).toEqual([75, 1050]);
  });
});

describe('readsPast', () => {
  it('reads the past while peeking or held, the present only live and not peeking', () => {
    // Arrange
    const live: LanesWindow = { kind: 'live', sec: 300 };
    const held: LanesWindow = { kind: 'held', from: 1000, to: 1300 };
    const rows = [
      { peeking: false, w: live },
      { peeking: true, w: live },
      { peeking: false, w: held },
      { peeking: true, w: held },
    ];

    // Act
    const past = rows.map((r) => readsPast(r.peeking, r.w));

    // Assert
    expect(past).toEqual([false, true, true, true]);
  });
});
