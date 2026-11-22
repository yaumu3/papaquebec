import { describe, expect, test } from 'bun:test';

import fc from 'fast-check';

import { compareImages, cropImage, type Image } from './imageDiff';

/** An image of `width` × 1 from its pixels' grey levels, opaque. */
const row = (...greys: number[]): Image => ({
  width: greys.length,
  height: 1,
  data: Uint8Array.from(greys.flatMap((grey) => [grey, grey, grey, 255])),
});

const LIMITS = { channel: 10, share: 0.25 };

describe('compareImages', () => {
  test('counts a pixel only when a channel moves past the tolerance, and marks it in the diff image', () => {
    // Arrange: each pixel of the baseline with how far one of its channels moves, either way
    const anyLevel = fc.integer({ min: 64, max: 191 });
    const anyPixel = fc.record({
      rgba: fc.tuple(anyLevel, anyLevel, anyLevel, anyLevel),
      channel: fc.nat(3),
      moved: fc.integer({ min: -64, max: 64 }),
    });
    const anyPixels = fc.array(anyPixel, { minLength: 1, maxLength: 16 });
    const anyTolerance = fc.nat(64);

    fc.assert(
      fc.property(anyPixels, anyTolerance, (pixels, channel) => {
        // Arrange
        const imageOf = (data: number[]): Image => ({
          width: pixels.length,
          height: 1,
          data: Uint8Array.from(data),
        });
        const baseline = imageOf(pixels.flatMap((pixel) => pixel.rgba));
        const actual = imageOf(
          pixels.flatMap((pixel) =>
            pixel.rgba.map((v, i) => (i === pixel.channel ? v + pixel.moved : v)),
          ),
        );
        const past = pixels.map((pixel) => Math.abs(pixel.moved) > channel);

        // Act
        const { differing, share, diff } = compareImages(baseline, actual, { channel, share: 1 });

        // Assert
        const marked = pixels.map(
          (_, i) => String(diff.data.slice(i * 4, i * 4 + 4)) === '255,0,255,255',
        );
        expect(differing).toBe(past.filter(Boolean).length);
        expect(share).toBe(differing / pixels.length);
        expect(marked).toEqual(past);
        expect(pixels.map((_, i) => diff.data[i * 4 + 3])).toEqual(pixels.map(() => 255));
      }),
    );
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

describe('cropImage', () => {
  test('takes the pixels under the clip, row by row', () => {
    // Arrange: an image of pixels each of its own grey, and a clip within it
    const anySide = fc.integer({ min: 1, max: 8 });
    const anyCrop = fc.tuple(anySide, anySide).chain(([width, height]) =>
      fc.record({
        width: fc.constant(width),
        height: fc.constant(height),
        x: fc.nat(width - 1),
        y: fc.nat(height - 1),
        right: fc.nat(width - 1),
        bottom: fc.nat(height - 1),
      }),
    );

    fc.assert(
      fc.property(anyCrop, ({ width, height, x, y, right, bottom }) => {
        // Arrange
        const greys = Array.from({ length: width * height }, (_, i) => i);
        const whole: Image = {
          width,
          height,
          data: Uint8Array.from(greys.flatMap((g) => [g, g, g, 255])),
        };
        const clip = {
          x: Math.min(x, right),
          y: Math.min(y, bottom),
          width: Math.abs(right - x) + 1,
          height: Math.abs(bottom - y) + 1,
        };

        // Act
        const part = cropImage(whole, clip);

        // Assert
        const under = greys.filter(
          (g) =>
            g % width >= clip.x &&
            g % width < clip.x + clip.width &&
            Math.floor(g / width) >= clip.y &&
            Math.floor(g / width) < clip.y + clip.height,
        );
        expect([part.width, part.height]).toEqual([clip.width, clip.height]);
        expect(Array.from(part.data)).toEqual(under.flatMap((g) => [g, g, g, 255]));
      }),
    );
  });
});
