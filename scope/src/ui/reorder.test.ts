import { describe, expect, it } from 'bun:test';

import { stepFromKey, trackReorder } from './reorder';

/** A reorder that records each move it is told to make. */
function reorder() {
  const moves: [number, number][] = [];
  const tracked = trackReorder((from, to) => moves.push([from, to]));
  return { ...tracked, moves };
}

describe('trackReorder', () => {
  it('moves the lane a place at a time as the pointer crosses each lane pitch', () => {
    // Arrange
    const r = reorder();
    r.down(0, 100, 50, 4);

    // Act
    r.move(130);
    r.move(176);
    r.move(224);

    // Assert
    expect(r.moves).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('goes no further than the last place, and back again from where it is', () => {
    // Arrange
    const r = reorder();
    r.down(1, 100, 50, 3);

    // Act
    r.move(400);
    r.move(0);

    // Assert
    expect(r.moves).toEqual([
      [1, 2],
      [2, 0],
    ]);
  });
});

describe('stepFromKey', () => {
  it('reads the arrow keys as a step up or down, and nothing else as one', () => {
    // Arrange
    const keys = ['ArrowUp', 'ArrowDown', 'Enter', ' '];

    // Act
    const steps = keys.map(stepFromKey);

    // Assert
    expect(steps).toEqual([-1, 1, null, null]);
  });
});
