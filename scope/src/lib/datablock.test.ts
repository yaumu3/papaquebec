import { describe, expect, it } from 'bun:test';

import {
  blockDir,
  blockOffset,
  blockRect,
  DB_HEIGHT,
  DB_WIDTH,
  DIRECTIONS,
  leader,
  LEADER_PX,
  leaderDir,
  NE,
} from './datablock';

const dirs = Array.from({ length: DIRECTIONS }, (_, d) => d);

describe('blockRect', () => {
  it('puts the block on the side of the target the direction names, starting at the leader', () => {
    // Arrange
    const [e, s, w, n, ne] = [0, 2, 4, 6, 7];

    // Act
    const r = [e, s, w, n, ne].map((d) => blockRect(100, 100, d, 0));

    // Assert
    expect(r[0]?.x0).toBeGreaterThan(100);
    expect((r[0]?.y0 ?? 0) + (r[0]?.y1 ?? 0)).toBe(200);
    expect(r[1]?.y0).toBeGreaterThan(100);
    expect(r[1]?.x0).toBe(100);
    expect(r[2]?.x1).toBeLessThan(100);
    expect(r[3]?.y1).toBeLessThan(100);
    expect(r[3]?.x0).toBe(100);
    expect(r[4]?.x0).toBeGreaterThan(100);
    expect(r[4]?.y1).toBeLessThan(100);
  });

  it('grows a block by its extra lines', () => {
    // Arrange
    const plain = blockRect(100, 100, 0, 0);

    // Act
    const emerg = blockRect(100, 100, 0, 1);

    // Assert
    expect(emerg.y1 - emerg.y0).toBeGreaterThan(plain.y1 - plain.y0);
    expect(emerg.x1 - emerg.x0).toBe(DB_WIDTH);
  });
});

describe('leader', () => {
  it('is the same length from the glyph edge to the block in every direction', () => {
    // Arrange
    const offsets = dirs.map((d) => blockOffset(d, 0));

    // Act
    const lengths = offsets.map(({ dx, dy }) => {
      const { a, b } = leader(dx, dy, DB_HEIGHT);
      return Math.hypot(b.x - a.x, b.y - a.y);
    });

    // Assert
    expect(lengths.map((l) => Math.round(l * 1e6) / 1e6)).toEqual(dirs.map(() => LEADER_PX));
  });

  it('runs toward a dragged block wherever it is', () => {
    // Arrange
    const dx = -200;
    const dy = 50;

    // Act
    const { a, b } = leader(dx, dy, DB_HEIGHT);

    // Assert
    expect(a.x).toBeLessThan(0);
    expect(b.x).toBeGreaterThan(dx + DB_WIDTH - 5);
    expect(b.y).toBeLessThan(dy + 1);
  });
});

describe('leaderDir', () => {
  it('recovers the direction of every placed block', () => {
    // Arrange
    const offsets = dirs.map((d) => blockOffset(d, 1));

    // Act
    const picked = offsets.map(({ dx, dy }) => leaderDir(dx, dy, 1));

    // Assert
    expect(picked).toEqual(dirs);
  });

  it('moves a released block where its leader points: straight to a cardinal, tilted to a diagonal', () => {
    // Arrange
    const above = { dx: -75, dy: -60 }; // the target under the block's right end, leader straight up
    const upperLeft = { dx: -85, dy: -86 }; // the block wholly left of the target, leader tilted
    const beside = { dx: 30, dy: -10 }; // the target level with the block, leader straight right
    const over = { dx: -10, dy: -10 }; // the block covering the target

    // Act
    const picked = [above, upperLeft, beside, over].map(({ dx, dy }) => leaderDir(dx, dy, 0));

    // Assert
    expect(picked).toEqual([6, 5, 0, NE]);
  });
});

describe('blockDir', () => {
  it('is the placed direction, else north-east', () => {
    // Arrange
    const placed = [2, null];

    // Act
    const picked = placed.map(blockDir);

    // Assert
    expect(picked).toEqual([2, NE]);
  });
});
