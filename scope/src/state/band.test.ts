import { describe, expect, it } from 'bun:test';

import { type Band, type BandLimits, formatEdge, parseEdge, withLower, withUpper } from './band';

const limits: BandLimits = { min: 0, max: 600, gap: 10 };
const band: Band = { lower: 50, upper: 200 };

describe('withLower', () => {
  it('moves the lower edge and pushes the upper edge to keep the gap', () => {
    // Arrange
    const values = [30, 195, 600, -5];

    // Act
    const out = values.map((v) => withLower(band, v, limits));

    // Assert
    expect(out).toEqual([
      { lower: 30, upper: 200 },
      { lower: 195, upper: 205 },
      { lower: 590, upper: 600 },
      { lower: 0, upper: 200 },
    ]);
  });
});

describe('withUpper', () => {
  it('moves the upper edge and pushes the lower edge to keep the gap', () => {
    // Arrange
    const values = [300, 55, 0, 700];

    // Act
    const out = values.map((v) => withUpper(band, v, limits));

    // Assert
    expect(out).toEqual([
      { lower: 50, upper: 300 },
      { lower: 45, upper: 55 },
      { lower: 0, upper: 10 },
      { lower: 50, upper: 600 },
    ]);
  });
});

describe('formatEdge', () => {
  it('prints three digits like a data block, with UNL at the upper stop', () => {
    // Arrange
    const values = [0, 50, 245, 600];

    // Act
    const out = values.map((v) => formatEdge(v, limits));

    // Assert
    expect(out).toEqual(['000', '050', '245', 'UNL']);
  });
});

describe('parseEdge', () => {
  it('reads up to three digits or UNL, treats anything past the top stop as UNL, and rejects the rest', () => {
    // Arrange
    const texts = ['050', '5', ' 245 ', 'unl', '600', '601', '999', '', 'FL050', '-5'];

    // Act
    const out = texts.map((t) => parseEdge(t, limits));

    // Assert
    expect(out).toEqual([50, 5, 245, 600, 600, 600, 600, null, null, null]);
  });
});
