import { describe, expect, it } from 'bun:test';

import { filterOf, orphansAmong, settled, unknownFilters } from './run';

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

describe('unknownFilters', () => {
  it('names each filter that takes nothing, even beside one that takes something', () => {
    // Arrange
    const only = ['block', 'blocks', 'map/defaul', 'block/level/'];

    // Act
    const unknown = unknownFilters(only, NAMES);

    // Assert
    expect(unknown).toEqual(['blocks', 'map/defaul']);
  });

  it('finds nothing to say without a filter', () => {
    // Arrange
    const only = undefined;

    // Act
    const unknown = unknownFilters(only, NAMES);

    // Assert
    expect(unknown).toEqual([]);
  });
});

describe('orphansAmong', () => {
  it('finds the baselines no name takes, leaving failed runs and other files alone', () => {
    // Arrange
    const paths = [
      'block/level.png',
      'block/gone.png',
      'block/level.actual.png',
      'block/level.diff.png',
      'Dockerfile',
    ];

    // Act
    const orphans = orphansAmong(paths, NAMES);

    // Assert
    expect(orphans).toEqual(['block/gone.png']);
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
