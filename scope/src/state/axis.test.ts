import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import {
  altitudeProfile,
  axisTicks,
  binIndex,
  edgeSpread,
  groundCount,
  scaleLabels,
  transitionLevel,
} from './axis';
import { fraction } from './band';

const limits = { min: 0, max: 600, gap: 10 };

describe('fraction', () => {
  it('maps a level to its share of the axis, clamped to the ends', () => {
    // Arrange
    const anyLimits = fc
      .tuple(fc.integer({ min: -500, max: 500 }), fc.integer({ min: 1, max: 1000 }))
      .map(([min, range]) => ({ min, max: min + range, gap: 1 }));
    const anyShare = fc.integer({ min: -1000, max: 2000 }).map((n) => n / 1000);

    fc.assert(
      fc.property(anyLimits, anyShare, (l, share) => {
        // Arrange
        const level = l.min + share * (l.max - l.min);

        // Act
        const at = fraction(level, l);

        // Assert
        expect(at).toBeCloseTo(share < 0 ? 0 : share > 1 ? 1 : share, 9);
      }),
    );
  });
});

describe('axisTicks', () => {
  it('labels every hundred in block notation with UNL at the top', () => {
    // Arrange
    const every = 100;

    // Act
    const out = axisTicks(limits, every);

    // Assert
    expect(out).toEqual([
      { at: 0, label: '000' },
      { at: 100, label: '100' },
      { at: 200, label: '200' },
      { at: 300, label: '300' },
      { at: 400, label: '400' },
      { at: 500, label: '500' },
      { at: 600, label: 'UNL' },
    ]);
  });
});

describe('transitionLevel', () => {
  it('is the transition altitude in hundreds of feet', () => {
    // Arrange
    const altimeters = [
      { transitionAltFt: 14000, qnhInHg: 29.92 },
      { transitionAltFt: 5450, qnhInHg: 30.1 },
    ];

    // Act
    const out = altimeters.map(transitionLevel);

    // Assert
    expect(out).toEqual([140, 55]);
  });
});

describe('edgeSpread', () => {
  it('pushes the edge fields apart only when their thumbs are closer than a field is tall', () => {
    // Arrange
    const bands = [
      { lower: 50, upper: 200 },
      { lower: 100, upper: 110 },
    ];

    // Act
    const out = bands.map((b) => edgeSpread(b, limits, { track: 190, field: 22 }));

    // Assert
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo((22 - 190 / 60) / 2, 5);
  });
});

describe('altitudeProfile', () => {
  it('counts airborne targets per bin of displayed altitude, leaving ground and unknown out', () => {
    // Arrange
    const std = { transitionAltFt: 14000, qnhInHg: 29.92 };
    const alts: (number | 'ground' | undefined)[] = [500, 1900, 2000, 35000, 'ground', undefined];
    const tracks = alts.map((alt) => ({ alt }));

    // Act
    const out = altitudeProfile(tracks, std, limits, 20);

    // Assert
    expect(out).toHaveLength(30);
    expect(out[0]).toBe(2); // 005 and 019
    expect(out[1]).toBe(1); // 020
    expect(out[17]).toBe(1); // FL350
    expect(out.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('puts the top stop in the last bin', () => {
    // Arrange
    const std = { transitionAltFt: 14000, qnhInHg: 29.92 };

    // Act
    const out = altitudeProfile([{ alt: 60000 }], std, limits, 20);

    // Assert
    expect(out[29]).toBe(1);
  });
});

describe('groundCount', () => {
  it('counts the targets reporting on the ground', () => {
    // Arrange
    const tracks = [
      { alt: 'ground' as const },
      { alt: 300 },
      { alt: undefined },
      { alt: 'ground' as const },
    ];

    // Act
    const out = groundCount(tracks);

    // Assert
    expect(out).toBe(2);
  });
});

describe('binIndex', () => {
  it('places a level in the bin that holds it, with anything past either stop in the bin at that end', () => {
    // Arrange: an axis of whole bins
    const anyAxis = fc
      .record({
        min: fc.integer({ min: -100, max: 100 }),
        bin: fc.integer({ min: 1, max: 50 }),
        bins: fc.integer({ min: 1, max: 40 }),
      })
      .map(({ min, bin, bins }) => ({ l: { min, max: min + bin * bins, gap: bin }, bin, bins }));
    const anyLevel = fc.integer({ min: -500, max: 3000 });

    fc.assert(
      fc.property(anyAxis, anyLevel, ({ l, bin, bins }, level) => {
        // Act
        const k = binIndex(level, l, bin);

        // Assert
        const held = Math.min(Math.max(level, l.min), l.max - 1);
        expect(Number.isInteger(k)).toBe(true);
        expect(l.min + k * bin).toBeLessThanOrEqual(held);
        expect(l.min + (k + 1) * bin).toBeGreaterThan(held);
        expect(k).toBeLessThan(bins);
      }),
    );
  });
});

describe('scaleLabels', () => {
  it('adds the TA tick and drops any label it would sit on', () => {
    // Arrange
    const ticks = axisTicks(limits, 100);

    // Act
    const clear = scaleLabels(ticks, 140, 25);
    const clash = scaleLabels(ticks, 110, 25);

    // Assert
    expect(clear.map((t) => t.label)).toEqual([
      '000',
      '100',
      'TA',
      '200',
      '300',
      '400',
      '500',
      'UNL',
    ]);
    expect(clash.map((t) => t.label)).toEqual(['000', 'TA', '200', '300', '400', '500', 'UNL']);
    expect(clear.find((t) => t.label === 'TA')).toEqual({ at: 140, label: 'TA', minor: true });
  });
});
