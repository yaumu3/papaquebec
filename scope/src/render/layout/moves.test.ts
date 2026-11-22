import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { type Move, MOVE_MS, moved, type Offset, retarget, settleMoves } from './moves';

const from = { dx: 20, dy: -40 };
const to = { dx: -100, dy: 20 };

describe('moved', () => {
  it('starts where the block was, ends where it goes, and eases between', () => {
    // Arrange: whole px, which the ends land on exactly, and two instants under way, in order
    const anyPx = fc.integer({ min: -2000, max: 2000 });
    const anyMove = fc
      .record({
        from: fc.record({ dx: anyPx, dy: anyPx }),
        to: fc.record({ dx: anyPx, dy: anyPx }),
        startedAt: fc.integer({ min: 0, max: 1_000_000 }),
      })
      .filter((m) => m.from.dx !== m.to.dx && m.from.dy !== m.to.dy);
    const anyUnderWay = fc
      .tuple(fc.integer({ min: 1, max: MOVE_MS - 1 }), fc.integer({ min: 1, max: MOVE_MS - 1 }))
      .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as const);
    const anyBeyond = fc.integer({ min: 0, max: 10_000 });

    fc.assert(
      fc.property(anyMove, anyUnderWay, anyBeyond, (move, [sooner, later], beyond) => {
        // Arrange
        const elapsed = [-beyond, sooner, later, MOVE_MS + beyond];

        // Act
        const [before, early, late, after] = elapsed.map((ms) => moved(move, move.startedAt + ms));

        // Assert
        const shares = [early, late].map((at = move.from) => [
          (at.dx - move.from.dx) / (move.to.dx - move.from.dx),
          (at.dy - move.from.dy) / (move.to.dy - move.from.dy),
        ]);
        const [[earlyX = 0, earlyY = 0] = [], [lateX = 0, lateY = 0] = []] = shares;
        expect(before).toEqual(move.from);
        expect(after).toEqual(move.to);
        expect(Math.min(earlyX, earlyY)).toBeGreaterThan(sooner / MOVE_MS); // eases out: fast first
        expect(Math.min(lateX - earlyX, lateY - earlyY)).toBeGreaterThanOrEqual(0);
        expect(Math.max(lateX, lateY)).toBeLessThan(1);
      }),
    );
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
