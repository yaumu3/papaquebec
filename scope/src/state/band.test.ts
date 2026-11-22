import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { type BandLimits, draggedEdge, formatEdge, parseEdge, withLower, withUpper } from './band';

const limits: BandLimits = { min: 0, max: 600, gap: 10 };

/** Limits with room for a band, a band within them, and a value in or out of them. */
const anyMove = fc
  .record({
    min: fc.integer({ min: -100, max: 100 }),
    gap: fc.integer({ min: 1, max: 20 }),
    room: fc.nat(200),
    width: fc.nat(200),
    below: fc.nat(200),
    value: fc.integer({ min: -200, max: 600 }),
  })
  .map(({ min, gap, room, width, below, value }) => {
    const lower = min + Math.min(below, room);
    const upper = lower + gap + Math.min(width, room - (lower - min));
    return { l: { min, max: min + gap + room, gap }, b: { lower, upper }, value };
  });

describe('withLower', () => {
  it('moves the lower edge no further than its stops, and pushes the upper edge only to keep the gap', () => {
    fc.assert(
      fc.property(anyMove, ({ l, b, value }) => {
        // Act
        const moved = withLower(b, value, l);

        // Assert
        const stop = l.max - l.gap;
        expect(moved.lower).toBe(value < l.min ? l.min : value > stop ? stop : value);
        expect(moved.upper).toBe(b.upper - moved.lower >= l.gap ? b.upper : moved.lower + l.gap);
        expect(moved.upper).toBeLessThanOrEqual(l.max);
      }),
    );
  });
});

describe('withUpper', () => {
  it('moves the upper edge no further than its stops, and pushes the lower edge only to keep the gap', () => {
    fc.assert(
      fc.property(anyMove, ({ l, b, value }) => {
        // Act
        const moved = withUpper(b, value, l);

        // Assert
        const stop = l.min + l.gap;
        expect(moved.upper).toBe(value < stop ? stop : value > l.max ? l.max : value);
        expect(moved.lower).toBe(moved.upper - b.lower >= l.gap ? b.lower : moved.upper - l.gap);
        expect(moved.lower).toBeGreaterThanOrEqual(l.min);
      }),
    );
  });
});

describe('formatEdge', () => {
  it('prints three digits like a data block, with UNL at the upper stop', () => {
    // Arrange
    const values = [0, 50, 245, 600];

    // Act
    const out = values.map((v) => formatEdge(v, limits));

    // Assert
    expect(out).toEqual(['000', '050', '245', 'UNL']);
  });
});

describe('parseEdge', () => {
  it('reads up to three digits or UNL, treats anything past the top stop as UNL, and rejects the rest', () => {
    // Arrange
    const texts = ['050', '5', ' 245 ', 'unl', '600', '601', '999', '', 'FL050', '-5'];

    // Act
    const out = texts.map((t) => parseEdge(t, limits));

    // Assert
    expect(out).toEqual([50, 5, 245, 600, 600, 600, 600, null, null, null]);
  });
});

describe('draggedEdge', () => {
  it('turns pointer travel up the axis into whole steps from where the drag began, as far as the stops', () => {
    // Arrange: stops and a start on whole steps, and travel within half a step of whole steps
    const anyDrag = fc
      .record({
        step: fc.constantFrom(1, 5, 10),
        bottom: fc.integer({ min: -10, max: 10 }),
        count: fc.integer({ min: 2, max: 100 }),
        from: fc.nat(100),
        steps: fc.integer({ min: -120, max: 120 }),
        off: fc.integer({ min: -40, max: 40 }),
        trackPx: fc.integer({ min: 50, max: 1000 }),
      })
      .map(({ step, bottom, count, from, steps, off, trackPx }) => {
        const l = { min: bottom * step, max: (bottom + count) * step, gap: step };
        const start = l.min + Math.min(from, count) * step;
        const dyPx = (-(steps + off / 100) * step * trackPx) / (l.max - l.min);
        return { l, step, start, steps, dyPx, trackPx };
      });

    fc.assert(
      fc.property(anyDrag, ({ l, step, start, steps, dyPx, trackPx }) => {
        // Act
        const edge = draggedEdge(start, dyPx, trackPx, l, step);

        // Assert: a step rounded up onto zero is -0, which is zero to all that read it
        const asked = start + steps * step;
        expect(edge + 0).toBe(asked < l.min ? l.min : asked > l.max ? l.max : asked);
      }),
    );
  });
});
