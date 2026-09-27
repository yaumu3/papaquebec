import { describe, expect, it } from 'bun:test';

import type { Vec2 } from '../../lib/geo';
import { rblLines } from './overlays';

/** An RBL end at `lat`, `lon`, drawn at `pos` on the scope plane. */
const end = (lat: number, lon: number, pos: Vec2 = { x: 0, y: 0 }, vel: Vec2 | null = null) => ({
  pos,
  geo: { lat, lon },
  vel,
  label: '',
});

/** Ten minutes of longitude east along the equator: 10.0 NM on course 090. */
const EAST = 10 / 60;

describe('rblLines', () => {
  it('shows distance and magnetic bearing with a degree sign', () => {
    // Arrange
    const a = end(0, 0);
    const b = end(0, EAST, { x: 10, y: 0 });

    // Act
    const lines = rblLines(a, b, 7.5);

    // Assert
    expect(lines).toEqual(['10.0 / 083°']);
  });

  it('measures along the geodesic, not across the map the ends are drawn on', () => {
    // Arrange
    const a = end(35, 142);
    const b = end(36, 142, { x: 3, y: 60 });

    // Act
    const lines = rblLines(a, b, 0);

    // Assert
    expect(lines).toEqual(['59.9 / 360°']);
  });

  it('appends time to go along the geodesic when only the origin moves', () => {
    // Arrange
    const a = end(0, 0, { x: 0, y: 0 }, { x: 60, y: 0 });
    const b = end(0, EAST, { x: 10, y: 0 });

    // Act
    const lines = rblLines(a, b, 0);

    // Assert
    expect(lines).toEqual(['10.0 / 090° / 10:01']);
  });

  it('appends the closest approach, worked on the scope plane, when both move', () => {
    // Arrange
    const a = end(0, 0, { x: 0, y: 0 }, { x: 60, y: 0 });
    const b = end(0, EAST, { x: 10, y: 5 }, { x: 0, y: 0 });

    // Act
    const lines = rblLines(a, b, 0);

    // Assert
    expect(lines).toEqual(['10.0 / 090°', 'CPA 5.0 in 10:00']);
  });
});
