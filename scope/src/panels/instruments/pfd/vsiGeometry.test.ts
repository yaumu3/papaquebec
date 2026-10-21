import { describe, expect, it } from 'bun:test';

import { type PfdGeometry, pfdGeometry } from './geometry';
import { vsiDigits, vsiNeedlePath, vsiOffset, vsiScale, vsiStripPath, vsiY } from './vsiGeometry';

describe('vsiOffset', () => {
  it('follows the nonlinear scale at each breakpoint, capped at 6000 fpm', () => {
    // Arrange
    const g = pfdGeometry(346);
    const rates = [500, 1000, 1500, 2000, 4000, 6000, 9000, -1000];

    // Act
    const out = rates.map((v) => vsiOffset(g, v));

    // Assert
    const expected = [13.6875, 27.375, 37.4125, 47.45, 60.225, 73, 73, -27.375];
    expected.forEach((e, i) => expect(out[i]).toBeCloseTo(e, 4));
  });
});

describe('vsiY', () => {
  it('stands above the centre line for a climb and below it for a descent', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = [vsiY(g, 6000), vsiY(g, 0), vsiY(g, -6000)];

    // Assert
    expect(out).toEqual([50, 123, 196]);
  });
});

describe('the parts of the vertical speed scale at 346 px', () => {
  it('stand where the layout puts them', () => {
    // Arrange
    const g = pfdGeometry(346);
    const rows: [(g: PfdGeometry) => unknown, unknown][] = [
      [vsiStripPath, 'M322.0 42.0H336.0L345.0 64.0V182.0L336.0 204.0H322.0Z'],
      [(g) => vsiNeedlePath(g, 0), 'M334.0 123.0L343.0 123.0'],
    ];

    // Act
    const out = rows.map(([part]) => part(g));

    // Assert
    expect(out).toEqual(rows.map(([, expected]) => expected));
  });
});

describe('vsiScale', () => {
  it('marks zero and ±500 to ±6000 fpm, labelling 1, 2 and 6 thousand at both signs', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = vsiScale(g);

    // Assert
    expect(out.ticks.startsWith('M332.0 123.0h7')).toBe(true);
    expect((out.ticks.match(/M/g) ?? []).length).toBe(13);
    expect(out.labels.map((l) => l.text)).toEqual(['1', '1', '2', '2', '6', '6']);
    expect(out.labels.slice(4)).toEqual([
      { text: '6', x: 324, y: 50 },
      { text: '6', x: 324, y: 196 },
    ]);
  });
});

describe('vsiDigits', () => {
  it('prints from 400 fpm, to 50, above the strip for a climb and below it for a descent', () => {
    // Arrange
    const g = pfdGeometry(346);
    const rates = [399, 400, 1820, -2210];

    // Act
    const out = rates.map((v) => vsiDigits(g, v));

    // Assert
    expect(out).toEqual([
      undefined,
      { text: '400', x: 344, y: 32 },
      { text: '1800', x: 344, y: 32 },
      { text: '2200', x: 344, y: 214 },
    ]);
  });
});
