import { describe, expect, it } from 'bun:test';

import { type Interval, MIN_SPAN_SEC, resolveSpan, type Span, timeAt, WHOLE, xOf } from './span';

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
