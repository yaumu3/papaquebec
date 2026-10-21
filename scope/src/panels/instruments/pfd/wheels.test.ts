import { describe, expect, it } from 'bun:test';

import { altitudeDigits, type SlotRow, speedDigits, type Wheel } from './wheels';

const roundedWheels = <T>(ws: Wheel<T>[]) =>
  ws.map((w) => ({ ...w, turned: Number(w.turned.toFixed(6)) }));

describe('speedDigits', () => {
  it('rolls the tens and hundreds through the last knot, the ones drum at its exact place', () => {
    // Arrange
    const speeds = [259, 260, 259.5, 299.5, 85, 0];

    // Act
    const out = speeds.map(speedDigits);

    // Assert
    expect(out.map((d) => roundedWheels([d.hundreds, d.tens, d.ones]))).toEqual([
      [
        { rows: ['3', '2'], turned: 0 },
        { rows: ['6', '5'], turned: 0 },
        { rows: ['1', '0', '9', '8'], turned: 0 },
      ],
      [
        { rows: ['3', '2'], turned: 0 },
        { rows: ['7', '6'], turned: 0 },
        { rows: ['2', '1', '0', '9'], turned: 0 },
      ],
      [
        { rows: ['3', '2'], turned: 0 },
        { rows: ['6', '5'], turned: 0.5 },
        { rows: ['1', '0', '9', '8'], turned: 0.5 },
      ],
      [
        { rows: ['3', '2'], turned: 0.5 },
        { rows: ['0', '9'], turned: 0.5 },
        { rows: ['1', '0', '9', '8'], turned: 0.5 },
      ],
      [
        { rows: ['1', ''], turned: 0 },
        { rows: ['9', '8'], turned: 0 },
        { rows: ['7', '6', '5', '4'], turned: 0 },
      ],
      [
        { rows: ['1', ''], turned: 0 },
        { rows: ['1', '0'], turned: 0 },
        { rows: ['2', '1', '0', ''], turned: 0 },
      ],
    ]);
  });
});

describe('altitudeDigits', () => {
  it('rolls the thousands, hundreds and drum through the last 20 ft before it changes, the drum at its exact place', () => {
    // Arrange
    const altitudes = [
      29575, 29595, 29995, 29600, 30000, 9990, 8640, -40, 10000, 9980, 0, 9995, 9985,
    ];

    // Act
    const out = altitudes.map(altitudeDigits);

    // Assert
    const wheels = out.map((d) => [d.thousands, d.hundreds, d.drum]);
    const rounded = wheels.map((row) =>
      row.map((w) => ({ ...w, turned: Number(w.turned.toFixed(6)) })),
    );
    expect(rounded).toEqual([
      [
        { rows: ['0', '9'], turned: 0 },
        { rows: ['6', '5'], turned: 0 },
        { rows: ['00', '80', '60', '40'], turned: 0.75 },
      ],
      [
        { rows: ['0', '9'], turned: 0 },
        { rows: ['6', '5'], turned: 0.75 },
        { rows: ['20', '00', '80', '60'], turned: 0.75 },
      ],
      [
        { rows: ['0', '9'], turned: 0.75 },
        { rows: ['0', '9'], turned: 0.75 },
        { rows: ['20', '00', '80', '60'], turned: 0.75 },
      ],
      [
        { rows: ['0', '9'], turned: 0 },
        { rows: ['7', '6'], turned: 0 },
        { rows: ['40', '20', '00', '80'], turned: 0 },
      ],
      [
        { rows: ['1', '0'], turned: 0 },
        { rows: ['1', '0'], turned: 0 },
        { rows: ['40', '20', '00', '80'], turned: 0 },
      ],
      [
        { rows: ['0', '9'], turned: 0.5 },
        { rows: ['0', '9'], turned: 0.5 },
        { rows: ['20', '00', '80', '60'], turned: 0.5 },
      ],
      [
        { rows: ['9', '8'], turned: 0 },
        { rows: ['7', '6'], turned: 0 },
        { rows: ['80', '60', '40', '20'], turned: 0 },
      ],
      [
        { rows: ['1', '0'], turned: 0 },
        { rows: ['1', '0'], turned: 0 },
        { rows: ['80', '60', '40', '20'], turned: 0 },
      ],
      [
        { rows: ['1', '0'], turned: 0 },
        { rows: ['1', '0'], turned: 0 },
        { rows: ['40', '20', '00', '80'], turned: 0 },
      ],
      [
        { rows: ['0', '9'], turned: 0 },
        { rows: ['0', '9'], turned: 0 },
        { rows: ['20', '00', '80', '60'], turned: 0 },
      ],
      [
        { rows: ['1', '0'], turned: 0 },
        { rows: ['1', '0'], turned: 0 },
        { rows: ['40', '20', '00', '20'], turned: 0 },
      ],
      [
        { rows: ['0', '9'], turned: 0.75 },
        { rows: ['0', '9'], turned: 0.75 },
        { rows: ['20', '00', '80', '60'], turned: 0.75 },
      ],
      [
        { rows: ['0', '9'], turned: 0.25 },
        { rows: ['0', '9'], turned: 0.25 },
        { rows: ['20', '00', '80', '60'], turned: 0.25 },
      ],
    ]);
  });
});

const digit = (text: string): SlotRow => ({ kind: 'digit', text });

describe('altitudeDigits drum near zero', () => {
  it('reads the absolute value in the row below 00, which is 20 within 20 ft of zero', () => {
    // Arrange
    const altitudes = [0, 15, -10, 20, -40];

    // Act
    const out = altitudes.map((ft) => altitudeDigits(ft).drum);

    // Assert
    expect(roundedWheels(out)).toEqual([
      { rows: ['40', '20', '00', '20'], turned: 0 },
      { rows: ['40', '20', '00', '20'], turned: 0.75 },
      { rows: ['40', '20', '00', '20'], turned: 0.5 },
      { rows: ['60', '40', '20', '00'], turned: 0 },
      { rows: ['80', '60', '40', '20'], turned: 0 },
    ]);
  });
});

describe('altitudeDigits slot', () => {
  it('is a digit from 10,000 ft, a hatch below it and NEG below zero, rolling through the last 20 ft', () => {
    // Arrange
    const altitudes = [29600, 10000, 9995, 9985, 9980, 8640, 0, -40];

    // Act
    const out = altitudes.map((ft) => altitudeDigits(ft).tenThousands);

    // Assert
    const hatch: SlotRow = { kind: 'hatch' };
    expect(roundedWheels(out)).toEqual([
      { rows: [digit('3'), digit('2')], turned: 0 },
      { rows: [digit('2'), digit('1')], turned: 0 },
      { rows: [digit('1'), hatch], turned: 0.75 },
      { rows: [digit('1'), hatch], turned: 0.25 },
      { rows: [digit('1'), hatch], turned: 0 },
      { rows: [digit('1'), hatch], turned: 0 },
      { rows: [digit('1'), hatch], turned: 0 },
      { rows: [digit('1'), { kind: 'neg' }], turned: 0 },
    ]);
  });
});
