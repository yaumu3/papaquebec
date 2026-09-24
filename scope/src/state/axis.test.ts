import { describe, expect, it } from 'bun:test';

import { axisTicks, edgeSpread, scaleLabels, transitionLevel } from './axis';
import { fraction } from './band';

const limits = { min: 0, max: 600, gap: 10 };

describe('fraction', () => {
  it('maps a level to its share of the axis, clamped to the ends', () => {
    // Arrange
    const values = [0, 150, 600, 700, -10];

    // Act
    const out = values.map((v) => fraction(v, limits));

    // Assert
    expect(out).toEqual([0, 0.25, 1, 1, 0]);
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
