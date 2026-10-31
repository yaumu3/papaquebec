import { describe, expect, it } from 'bun:test';

import type { Batch } from '../protocol';
import { atlas } from './atlasFixture';
import { buildCoast, buildRings } from './static';

/** A stand-in ring outline of two segments, its first point north at `(1, r)`. */
const ringPath = (r: number) => [
  { x: 1, y: r },
  { x: r, y: 0 },
  { x: 1, y: r },
];

const count = (batches: Batch[] | undefined, kind: Batch['kind']) =>
  (batches ?? []).filter((b) => b.kind === kind).reduce((n, b) => n + b.count, 0);

/** Where the first glyph of the first text batch is anchored. */
const firstAt = (batches: Batch[] | undefined) =>
  Array.from(batches?.find((b) => b.kind === 'text')?.data.subarray(0, 2) ?? []);

const project = (lat: number, lon: number) => ({ x: lon, y: lat });

describe('buildRings', () => {
  it('draws each ring along its path, with the radius printed at its first, northern point', () => {
    // Arrange
    const input = { shown: true, rangeNm: 40, ringExtentNm: 40, ringPath, atlas };

    // Act
    const { ringLines, ringLabels } = buildRings(input);

    // Assert
    expect(count(ringLines, 'lines')).toBe(4 * 2);
    expect(count(ringLabels, 'text')).toBe('10203040'.length);
    expect(firstAt(ringLabels)).toEqual([1, 10]);
  });

  it('draws nothing when the rings are hidden, and still fills both slots', () => {
    // Arrange
    const input = { shown: false, rangeNm: 40, ringExtentNm: 40, ringPath, atlas };

    // Act
    const { ringLines, ringLabels } = buildRings(input);

    // Assert
    expect([count(ringLines, 'lines'), count(ringLabels, 'text')]).toEqual([0, 0]);
    expect([ringLines?.length, ringLabels?.length]).toEqual([1, 1]);
  });
});

describe('buildCoast', () => {
  it('splits long edges along the geodesic', () => {
    // Arrange
    const outline: [number, number][] = [
      [130, 35],
      [150, 35],
      [140, 40],
    ];

    // Act
    const { coastLines } = buildCoast({ shown: true, coast: { lines: [outline] }, project });

    // Assert
    expect(count(coastLines, 'lines')).toBeGreaterThan(2);
  });

  it('draws nothing when the coastline is hidden', () => {
    // Arrange
    const coast = {
      lines: [
        [
          [130, 35],
          [140, 40],
        ] as [number, number][],
      ],
    };

    // Act
    const { coastLines } = buildCoast({ shown: false, coast, project });

    // Assert
    expect(count(coastLines, 'lines')).toBe(0);
  });
});
