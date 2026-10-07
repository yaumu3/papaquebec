import { describe, expect, it } from 'bun:test';

import { overlap, type Rect } from '../../lib/datablock';
import { RectGrid } from './grid';

/** Deterministic rectangles across a wide span, crowded enough that many overlap. */
function scatter(count: number, seed: number): Rect[] {
  let s = seed;
  const rand = () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s / 2_147_483_648;
  };
  return Array.from({ length: count }, () => {
    const x0 = (rand() - 0.5) * 2000;
    const y0 = (rand() - 0.5) * 2000;
    return { x0, y0, x1: x0 + 4 + rand() * 120, y1: y0 + 4 + rand() * 40 };
  });
}

describe('RectGrid', () => {
  it('sums the overlap with every rectangle added exactly as a scan in insertion order would', () => {
    // Arrange
    const added = scatter(600, 7);
    const queries = scatter(300, 11);
    const grid = new RectGrid();
    for (const r of added) grid.add(r);
    const scanned = queries.map((q) => added.reduce((cost, r) => cost + overlap(q, r), 0));

    // Act
    const found = queries.map((q) => grid.overlapWith(q));

    // Assert
    expect(found).toEqual(scanned);
  });
});
