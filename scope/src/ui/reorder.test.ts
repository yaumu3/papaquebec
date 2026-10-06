import { describe, expect, it } from 'bun:test';

import { trackReorder } from './reorder';

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
