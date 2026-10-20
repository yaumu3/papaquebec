import { describe, expect, it } from 'bun:test';

import { type LaneMoves, onMoveKey, perform } from './moves';

/** The moves of a lane at the given end, if any, recording each one made. */
function moves(end: { first?: boolean; last?: boolean } = {}) {
  const made: string[] = [];
  const m: LaneMoves = {
    first: end.first ?? false,
    last: end.last ?? false,
    onUp: () => made.push('up'),
    onDown: () => made.push('down'),
    onRemove: () => made.push('remove'),
  };
  return { m, made };
}

describe('perform', () => {
  it('moves a lane up or down, or removes it, as asked', () => {
    // Arrange
    const { m, made } = moves();
    const asks = ['up', 'down', 'remove'] as const;

    // Act
    for (const ask of asks) perform(m, ask);

    // Assert
    expect(made).toEqual(['up', 'down', 'remove']);
  });

  it('moves the first lane no higher and the last no lower, and removes either', () => {
    // Arrange
    const cases = [
      { end: { first: true }, ask: 'up' },
      { end: { first: true }, ask: 'remove' },
      { end: { last: true }, ask: 'down' },
      { end: { last: true }, ask: 'remove' },
    ] as const;
    const lanes = cases.map((c) => Object.assign(moves(c.end), { ask: c.ask }));

    // Act
    for (const lane of lanes) perform(lane.m, lane.ask);

    // Assert
    expect(lanes.map((lane) => lane.made)).toEqual([[], ['remove'], [], ['remove']]);
  });
});

describe('onMoveKey', () => {
  it('takes a key that asks for a move, kept from the page, and leaves any other alone', () => {
    // Arrange
    const { m, made } = moves();
    const kept: string[] = [];
    const press = (key: string, altKey: boolean) => ({
      key,
      altKey,
      preventDefault: () => kept.push(`${key} default`),
      stopPropagation: () => kept.push(`${key} propagation`),
    });
    const presses = [press('ArrowDown', true), press('ArrowDown', false), press('x', false)];

    // Act
    for (const e of presses) onMoveKey(m, e);

    // Assert
    expect(made).toEqual(['down']);
    expect(kept).toEqual(['ArrowDown default', 'ArrowDown propagation']);
  });
});
