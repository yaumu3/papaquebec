import { describe, expect, test } from 'bun:test';

import { compareImages, type Image } from './imageDiff';

/** An image of `width` × 1 from its pixels' grey levels, opaque. */
const row = (...greys: number[]): Image => ({
  width: greys.length,
  height: 1,
  data: Uint8Array.from(greys.flatMap((grey) => [grey, grey, grey, 255])),
});

const LIMITS = { channel: 10, share: 0.25 };

describe('compareImages', () => {
  test('counts a pixel only when a channel moves past the tolerance', () => {
    // Arrange
    const baseline = row(100, 100, 100, 100);
    const actual = row(100, 110, 111, 89);

    // Act
    const { differing } = compareImages(baseline, actual, LIMITS);

    // Assert
    expect(differing).toBe(2);
  });

  test('passes at the share cap and fails past it', () => {
    // Arrange
    const baseline = row(0, 0, 0, 0);
    const cases = [row(255, 0, 0, 0), row(255, 255, 0, 0)];

    // Act
    const passed = cases.map((actual) => compareImages(baseline, actual, LIMITS).passed);

    // Assert
    expect(passed).toEqual([true, false]);
  });

  test('marks the differing pixels in the diff image', () => {
    // Arrange
    const baseline = row(0, 0);
    const actual = row(0, 255);

    // Act
    const { diff } = compareImages(baseline, actual, LIMITS);

    // Assert
    expect(Array.from(diff.data.slice(4, 8))).toEqual([255, 0, 255, 255]);
    expect(diff.data[3]).toBe(255);
    expect(diff.data[0]).not.toBe(255);
  });

  test('fails images of different sizes', () => {
    // Arrange
    const baseline = row(0, 0);
    const actual = row(0, 0, 0);

    // Act
    const { passed, share } = compareImages(baseline, actual, LIMITS);

    // Assert
    expect(passed).toBe(false);
    expect(share).toBe(1);
  });
});
