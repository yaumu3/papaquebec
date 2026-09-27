import { describe, expect, it } from 'bun:test';

import { type Batch, Shape } from '../protocol';
import { buildHover, type HoverInput } from './hover';
import { parseColor } from './pack';
import { trackColor } from './rules';
import { makeTrack } from './trackFixture';

function input(over: Partial<HoverInput> = {}): HoverInput {
  return {
    track: makeTrack(),
    selected: null,
    filter: { ground: true, lowerFl: 0, upperFl: 500, squawk: 'all' },
    altimeter: { transitionAltFt: 14000, qnhInHg: 29.92 },
    labelDrag: null,
    ...over,
  };
}

/** Offsets into a line instance; see `pack.ts`. */
const LINE_B_PX = 6;
const LINE_RGBA = 11;

const batch = (batches: Batch[], kind: Batch['kind']) => batches.find((b) => b.kind === kind);
const count = (batches: Batch[]) => batches.reduce((n, b) => n + b.count, 0);

describe('buildHover', () => {
  it('boxes the hovered target and draws its leader at full brightness', () => {
    // Arrange
    const t = makeTrack();

    // Act
    const batches = buildHover(input({ track: t }));

    // Assert
    const markers = batch(batches, 'markers');
    const lines = batch(batches, 'lines');
    expect(markers?.count).toBe(1);
    expect(markers?.data[5]).toBe(Shape.HollowSquare);
    expect(lines?.count).toBe(1);
    const rgba = Array.from(lines?.data.slice(LINE_RGBA, LINE_RGBA + 4) ?? []);
    expect(rgba).toEqual(parseColor(trackColor(t, null)).map((c) => Math.fround(c)));
  });

  it('draws nothing without a target, for the selected one, or for a filtered one', () => {
    // Arrange
    const t = makeTrack();
    const cases = [
      input({ track: null }),
      input({ track: t, selected: t.hex }),
      input({ track: t, filter: { ground: true, lowerFl: 200, upperFl: 500, squawk: 'all' } }),
    ];

    // Act
    const drawn = cases.map((c) => count(buildHover(c)));

    // Assert
    expect(drawn).toEqual([0, 0, 0]);
  });

  it('runs the leader to a block being dragged rather than to its corner', () => {
    // Arrange
    const t = makeTrack({ ops: { hideTrail: false, pinnedCorner: null, autoCorner: 'ne' } });
    const labelDrag = { hex: t.hex, dx: 60, dy: 30 };

    // Act
    const lines = batch(buildHover(input({ track: t, labelDrag })), 'lines');

    // Assert
    expect(lines?.count).toBe(1);
    expect(lines?.data[LINE_B_PX]).toBe(60 - 3);
  });
});
