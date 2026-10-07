/** How long a block takes to slide to a new bearing, ms. */
export const MOVE_MS = 300;

/** Offset from a target to its block's top-left corner, CSS px. */
export interface Offset {
  dx: number;
  dy: number;
}

/** A block under way from where it was drawn to its new bearing. */
export interface Move {
  from: Offset;
  to: Offset;
  /** Milliseconds, on the clock the moves are drawn by. */
  startedAt: number;
}

/** Fast first, then settling, so the eye catches the start and reads the end. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Where a moving block is drawn at `now`: eased from where it started toward its bearing. */
export function moved(m: Move, now: number): Offset {
  const k = easeOut(Math.min(1, Math.max(0, (now - m.startedAt) / MOVE_MS)));
  return { dx: m.from.dx + (m.to.dx - m.from.dx) * k, dy: m.from.dy + (m.to.dy - m.from.dy) * k };
}

/**
 * A move toward `to` starting now: from where a move already under way has got to, else from
 * `drawn`, where the block is drawn without one.
 */
export function retarget(current: Move | undefined, drawn: Offset, to: Offset, now: number): Move {
  return { from: current ? moved(current, now) : drawn, to, startedAt: now };
}

/**
 * Drops the moves that have run their course by `now`, leaving each block drawn at its bearing,
 * so the next frame finds it there and starts no move of its own.
 */
export function settleMoves(
  moves: Map<string, Move>,
  drawn: Map<string, Offset>,
  now: number,
): void {
  for (const [hex, m] of moves) {
    if (now - m.startedAt < MOVE_MS) continue;
    drawn.set(hex, m.to);
    moves.delete(hex);
  }
}
