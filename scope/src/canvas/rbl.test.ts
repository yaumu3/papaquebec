import { describe, expect, it } from 'bun:test';

import type { Rbl } from '../state/scope';
import { anchorFor, appendRbl } from './rbl';

const target = (hex: string) => ({ kind: 'target' as const, hex });
const free = (x: number, y: number) => ({ kind: 'free' as const, x, y });

describe('anchorFor', () => {
  it('anchors on the target when there is one, else on the world point', () => {
    // Arrange
    const world = { x: 3, y: -4 };

    // Act
    const out = [anchorFor({ hex: '867a01' }, world), anchorFor(null, world)];

    // Assert
    expect(out).toEqual([target('867a01'), free(3, -4)]);
  });
});

describe('appendRbl', () => {
  it('adds the line with the next free tag', () => {
    // Arrange
    const existing: Rbl[] = [{ a: free(0, 0), b: free(1, 1), tag: 'A' }];

    // Act
    const out = appendRbl(existing, target('867a01'), free(5, 5));

    // Assert
    expect(out).toEqual([...existing, { a: target('867a01'), b: free(5, 5), tag: 'B' }]);
  });

  it('leaves the list alone when both ends are the same target', () => {
    // Arrange
    const existing: Rbl[] = [{ a: free(0, 0), b: free(1, 1), tag: 'A' }];

    // Act
    const out = appendRbl(existing, target('867a01'), target('867a01'));

    // Assert
    expect(out).toBe(existing);
  });
});
