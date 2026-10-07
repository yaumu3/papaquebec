import { describe, expect, it } from 'bun:test';

import { encodeScene } from './encode';
import type { Subject } from './placement';

describe('encodeScene', () => {
  it('lays out a count, the fields of every subject, then every history as x, y pairs', () => {
    // Arrange
    const a: Subject = {
      hex: 'a',
      cx: 10,
      cy: 20,
      vx: 1,
      vy: -1,
      extraLines: 1,
      dir: 3,
      sinceMove: 12.5,
      manual: true,
      altitudeFt: 5000,
      turnRateDegPerSec: 0.5,
      history: [
        { x: 9, y: 19 },
        { x: 8, y: 18 },
      ],
    };
    const b: Subject = {
      hex: 'b',
      cx: 30,
      cy: 40,
      vx: 0,
      vy: 0,
      extraLines: 0,
      dir: null,
      sinceMove: Infinity,
      manual: false,
      altitudeFt: NaN,
      turnRateDegPerSec: 0,
      history: [],
    };

    // Act
    const flat = Array.from(encodeScene({ subjects: [a, b], pxPerNm: 10 }));

    // Assert
    expect(flat).toEqual(
      [
        [2],
        [10, 20, 1, -1, 1, 3, 12.5, 1, 5000, 0.5, 2],
        [30, 40, 0, 0, 0, -1, Infinity, 0, NaN, 0, 0],
        [9, 19, 8, 18],
      ].flat(),
    );
  });
});
