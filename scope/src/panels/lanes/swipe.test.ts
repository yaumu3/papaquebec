import { describe, expect, it } from 'bun:test';

import { axisOf, swipeOffset, swipeRemoves } from './swipe';

describe('axisOf', () => {
  it('tells nothing within the slop, then the axis the finger went further along', () => {
    // Arrange
    const moves: [number, number][] = [
      [3, 2],
      [-10, 4],
      [2, 9],
      [6, -6],
    ];

    // Act
    const axes = moves.map(([dx, dy]) => axisOf(dx, dy, 4));

    // Assert
    expect(axes).toEqual([null, 'x', 'y', 'y']);
  });
});

describe('swipeOffset', () => {
  it('follows a finger leftward, and stays put rightward', () => {
    // Arrange
    const dxs = [-40, 0, 25];

    // Act
    const offsets = dxs.map(swipeOffset);

    // Assert
    expect(offsets).toEqual([-40, 0, 0]);
  });
});

describe('swipeRemoves', () => {
  it('removes only past a third of the width leftward', () => {
    // Arrange
    const dxs = [-101, -100, -50, 150];

    // Act
    const removes = dxs.map((dx) => swipeRemoves(dx, 300));

    // Assert
    expect(removes).toEqual([true, false, false, false]);
  });
});
