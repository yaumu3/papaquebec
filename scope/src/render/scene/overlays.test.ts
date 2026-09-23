import { describe, expect, it } from 'bun:test';

import { rblLines } from './overlays';

describe('rblLines', () => {
  it('shows distance and magnetic bearing with a degree sign', () => {
    // Arrange
    const a = { pos: { x: 0, y: 0 }, vel: null, label: '' };
    const b = { pos: { x: 10, y: 0 }, vel: null, label: '' };

    // Act
    const lines = rblLines(a, b, 7.5);

    // Assert
    expect(lines).toEqual(['10.0 / 083°']);
  });

  it('appends time to go when only the origin moves, and CPA when both move', () => {
    // Arrange
    const a = { pos: { x: 0, y: 0 }, vel: { x: 60, y: 0 }, label: '' };
    const still = { pos: { x: 10, y: 0 }, vel: null, label: '' };
    const moving = { pos: { x: 10, y: 5 }, vel: { x: 0, y: 0 }, label: '' };

    // Act
    const ete = rblLines(a, still, 0);
    const cpa = rblLines(a, moving, 0);

    // Assert
    expect(ete).toEqual(['10.0 / 090° / 10:00']);
    expect(cpa).toEqual(['11.2 / 063°', 'CPA 5.0 in 10:00']);
  });
});
