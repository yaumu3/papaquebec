import { describe, expect, it } from 'bun:test';

import {
  dragBase,
  dragInterval,
  grabAt,
  type Interval,
  MIN_SPAN_SEC,
  resolveSpan,
  type Span,
  spanOf,
  timeAt,
  WHOLE,
  xOf,
} from './span';

/** A contact of ten minutes. */
const CONTACT: Interval = { from: 1000, to: 1600 };

describe('resolveSpan', () => {
  it('shows the whole contact', () => {
    // Arrange
    const span: Span = WHOLE;

    // Act
    const visible = resolveSpan(span, CONTACT);

    // Assert
    expect(visible).toEqual(CONTACT);
  });

  it('shows at least the minimum span, ending with a contact shorter than that', () => {
    // Arrange
    const brief: Interval = { from: 1000, to: 1010 };

    // Act
    const visible = resolveSpan(WHOLE, brief);

    // Assert
    expect(visible).toEqual({ from: 1010 - MIN_SPAN_SEC, to: 1010 });
  });

  it('shows the last seconds of the contact for a tail, the whole of one shorter than the tail', () => {
    // Arrange
    const tail: Span = { kind: 'tail', sec: 120 };
    const brief: Interval = { from: 1500, to: 1600 };

    // Act
    const visible = [resolveSpan(tail, CONTACT), resolveSpan(tail, brief)];

    // Assert
    expect(visible).toEqual([{ from: 1480, to: 1600 }, brief]);
  });

  it('keeps a fixed interval inside the contact, sliding one the contact has moved past', () => {
    // Arrange
    const inside: Span = { kind: 'fixed', from: 1100, to: 1300 };
    const past: Span = { kind: 'fixed', from: 900, to: 1030 };

    // Act
    const visible = [resolveSpan(inside, CONTACT), resolveSpan(past, CONTACT)];

    // Assert
    expect(visible).toEqual([
      { from: 1100, to: 1300 },
      { from: 1000, to: 1000 + MIN_SPAN_SEC },
    ]);
  });
});

describe('spanOf', () => {
  it('is the whole contact when the interval covers it', () => {
    // Arrange
    const interval: Interval = { from: 1000, to: 1600 };

    // Act
    const span = spanOf(interval, CONTACT);

    // Assert
    expect(span).toEqual(WHOLE);
  });

  it('is a tail of its own length when the interval ends with the contact', () => {
    // Arrange
    const interval: Interval = { from: 1300, to: 1600 };

    // Act
    const span = spanOf(interval, CONTACT);

    // Assert
    expect(span).toEqual({ kind: 'tail', sec: 300 });
  });

  it('is fixed when the interval ends before the contact does', () => {
    // Arrange
    const interval: Interval = { from: 1000, to: 1300 };

    // Act
    const span = spanOf(interval, CONTACT);

    // Assert
    expect(span).toEqual({ kind: 'fixed', from: 1000, to: 1300 });
  });
});

describe('grabAt', () => {
  it('takes an edge within the tolerance, the body between them, else the rest', () => {
    // Arrange
    const visible: Interval = { from: 1200, to: 1400 };
    const presses = [1195, 1404, 1300, 1100, 1500];

    // Act
    const grabs = presses.map((t) => grabAt(t, visible, 10));

    // Assert
    expect(grabs).toEqual(['left', 'right', 'body', 'outside', 'outside']);
  });

  it('takes the nearer edge of a narrow interval', () => {
    // Arrange
    const narrow: Interval = { from: 1200, to: 1212 };

    // Act
    const grabs = [grabAt(1205, narrow, 10), grabAt(1207, narrow, 10)];

    // Assert
    expect(grabs).toEqual(['left', 'right']);
  });
});

describe('dragInterval', () => {
  const start: Interval = { from: 1200, to: 1400 };

  it('moves the left edge, no nearer the right one than the minimum span', () => {
    // Arrange
    const moves = [1100, 1390];

    // Act
    const dragged = moves.map((t) => dragInterval('left', start, 1200, t, CONTACT));

    // Assert
    expect(dragged).toEqual([
      { from: 1100, to: 1400 },
      { from: 1400 - MIN_SPAN_SEC, to: 1400 },
    ]);
  });

  it('moves the right edge, no further than the contact goes', () => {
    // Arrange
    const moves = [1500, 1700];

    // Act
    const dragged = moves.map((t) => dragInterval('right', start, 1400, t, CONTACT));

    // Assert
    expect(dragged).toEqual([
      { from: 1200, to: 1500 },
      { from: 1200, to: 1600 },
    ]);
  });

  it('moves the body as far as the pointer went, stopping at the ends of the contact', () => {
    // Arrange
    const moves = [1350, 1600, 0];

    // Act
    const dragged = moves.map((t) => dragInterval('body', start, 1300, t, CONTACT));

    // Assert
    expect(dragged).toEqual([
      { from: 1250, to: 1450 },
      { from: 1400, to: 1600 },
      { from: 1000, to: 1200 },
    ]);
  });

  it('selects between the press and the pointer, whichever way it went, within the contact', () => {
    // Arrange
    const moves = [1150, 1050, 900];

    // Act
    const dragged = moves.map((t) => dragInterval('outside', start, 1100, t, CONTACT));

    // Assert
    expect(dragged).toEqual([
      { from: 1100, to: 1150 },
      { from: 1050, to: 1100 },
      { from: 1000, to: 1100 },
    ]);
  });
});

describe('xOf and timeAt', () => {
  it('map a time across the width and back', () => {
    // Arrange
    const visible: Interval = { from: 1000, to: 1200 };

    // Act
    const x = xOf(1050, visible, 300);
    const t = timeAt(x, visible, 300);

    // Assert
    expect(x).toBe(75);
    expect(t).toBe(1050);
  });
});

describe('dragBase', () => {
  it('keeps the window ending where it ends now while its left edge is dragged, so a tail goes on following', () => {
    // Arrange
    const pressed: Interval = { from: 1200, to: 1400 };
    const visible: Interval = { from: 1200, to: 1403 };

    // Act
    const bases = [dragBase('left', pressed, visible), dragBase('right', pressed, visible)];

    // Assert
    expect(bases).toEqual([{ from: 1200, to: 1403 }, pressed]);
  });
});
