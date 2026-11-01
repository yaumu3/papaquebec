import { describe, expect, it } from 'bun:test';

import { filterOf, settled } from './run';

const NAMES = ['block/level', 'block/hovered', 'map/default'];

/** A shooter giving each of `shots` in turn, then the last for good. */
const shooter = (shots: readonly string[]) => {
  let at = 0;
  return async () => {
    const shot = shots[Math.min(at, shots.length - 1)] ?? '';
    at += 1;
    return Buffer.from(shot);
  };
};
const pause = async () => {};

describe('filterOf', () => {
  it('takes every name without a filter, else a name or a folder, with or without its slash', () => {
    // Arrange
    const filters = [undefined, ['map/default'], ['block'], ['block/']];

    // Act
    const taken = filters.map((only) => NAMES.filter(filterOf(only)));

    // Assert
    expect(taken).toEqual([
      NAMES,
      ['map/default'],
      ['block/level', 'block/hovered'],
      ['block/level', 'block/hovered'],
    ]);
  });
});

describe('settled', () => {
  it('waits for three shots alike in a row, so one slow frame does not pass for the last', async () => {
    // Arrange
    const shoot = shooter(['early', 'early', 'late', 'late', 'late']);

    // Act
    const shot = await settled(shoot, { pause, tries: 10 });

    // Assert
    expect(shot.toString()).toBe('late');
  });

  it('gives up on a page that keeps changing', async () => {
    // Arrange
    const shoot = shooter(['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']);

    // Act
    const outcome = await settled(shoot, { pause, tries: 4 }).catch((error: unknown) => error);

    // Assert
    expect(String(outcome)).toContain('did not settle');
  });
});
