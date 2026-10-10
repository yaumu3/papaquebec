import { describe, expect, it } from 'bun:test';

import type { Vec2 } from '../../lib/geo';
import { rblLines } from './rbl';

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
  it('shows distance and the bearing made magnetic at the origin, with a degree sign', () => {
    // Arrange: a declination of 7.5° east at the origin and nothing like it at the far end
    const a = end(0, 0);
    const b = end(0, EAST, { x: 10, y: 0 });
    const declination = (_lat: number, lon: number) => (lon === 0 ? 7.5 : -20);

    // Act
    const lines = rblLines(a, b, declination);

    // Assert
    expect(lines).toEqual(['10.0 / 083°']);
  });

  it('measures along the geodesic, not across the map the ends are drawn on', () => {
    // Arrange
    const a = end(35, 142);
    const b = end(36, 142, { x: 3, y: 60 });

    // Act
    const lines = rblLines(a, b, () => 0);

    // Assert
    expect(lines).toEqual(['59.9 / 360°']);
  });

  it('appends time to go along the geodesic when only the origin moves', () => {
    // Arrange
    const a = end(0, 0, { x: 0, y: 0 }, { x: 60, y: 0 });
    const b = end(0, EAST, { x: 10, y: 0 });

    // Act
    const lines = rblLines(a, b, () => 0);

    // Assert
    expect(lines).toEqual(['10.0 / 090° / 10:01']);
  });

  it('shows only distance and bearing when both move', () => {
    // Arrange
    const a = end(0, 0, { x: 0, y: 0 }, { x: 60, y: 0 });
    const b = end(0, EAST, { x: 10, y: 5 }, { x: 0, y: 0 });

    // Act
    const lines = rblLines(a, b, () => 0);

    // Assert
    expect(lines).toEqual(['10.0 / 090°']);
  });
});
