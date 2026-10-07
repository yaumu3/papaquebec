import { describe, expect, it } from 'bun:test';

import { type Move, MOVE_MS, moved, type Offset, retarget, settleMoves } from './moves';

const from = { dx: 20, dy: -40 };
const to = { dx: -100, dy: 20 };

describe('moved', () => {
  it('starts where the block was, ends where it goes, and eases between', () => {
    // Arrange
    const move: Move = { from, to, startedAt: 1000 };
    const times = [
      1000,
      1000 + MOVE_MS / 4,
      1000 + MOVE_MS / 2,
      1000 + MOVE_MS,
      1000 + 2 * MOVE_MS,
    ];

    // Act
    const at = times.map((t) => moved(move, t));

    // Assert
    expect(at[0]).toEqual(from);
    expect(at[3]).toEqual(to);
    expect(at[4]).toEqual(to);
    const share = (p: { dx: number }) => (p.dx - from.dx) / (to.dx - from.dx);
    expect(share(at[1] ?? from)).toBeGreaterThan(0.25); // eases out: fast first
    expect(share(at[2] ?? from)).toBeGreaterThan(share(at[1] ?? from));
    expect(share(at[2] ?? from)).toBeLessThan(1);
  });
});

describe('retarget', () => {
  it('starts a move from where the block is drawn toward its new place', () => {
    // Arrange
    const drawn = { dx: 5, dy: 5 };

    // Act
    const move = retarget(undefined, drawn, to, 1000);

    // Assert
    expect(move).toEqual({ from: drawn, to, startedAt: 1000 });
  });

  it('retargets a move under way from its current drawn position', () => {
    // Arrange
    const underWay: Move = { from, to, startedAt: 1000 };
    const elsewhere = { dx: 0, dy: 60 };
    const halfway = moved(underWay, 1000 + MOVE_MS / 2);

    // Act
    const move = retarget(underWay, halfway, elsewhere, 1000 + MOVE_MS / 2);

    // Assert
    expect(move.from).toEqual(halfway);
    expect(move.to).toEqual(elsewhere);
    expect(move.startedAt).toBe(1000 + MOVE_MS / 2);
  });
});

describe('settleMoves', () => {
  it('drops a move that has run its course and leaves its block drawn at the bearing', () => {
    // Arrange
    const moves = new Map<string, Move>([['a', { from, to, startedAt: 1000 }]]);
    const drawn = new Map<string, Offset>([['a', { dx: -99.9, dy: 19.9 }]]);

    // Act
    settleMoves(moves, drawn, 1000 + MOVE_MS);

    // Assert
    expect(moves.size).toBe(0);
    expect(drawn.get('a')).toEqual(to);
  });

  it('keeps a move still under way, and where its block was drawn', () => {
    // Arrange
    const moves = new Map<string, Move>([['a', { from, to, startedAt: 1000 }]]);
    const drawn = new Map<string, Offset>([['a', { dx: -90, dy: 15 }]]);

    // Act
    settleMoves(moves, drawn, 1000 + MOVE_MS - 1);

    // Assert
    expect(moves.has('a')).toBe(true);
    expect(drawn.get('a')).toEqual({ dx: -90, dy: 15 });
  });
});
