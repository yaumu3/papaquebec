import { describe, expect, it } from 'bun:test';

import {
  attitude,
  bankIndexPath,
  bankScalePath,
  fpvAt,
  fpvPath,
  windowRect,
} from './attitudeGeometry';
import { pfdGeometry } from './geometry';

describe('attitude horizon', () => {
  it('passes through the centre, cutting the window at its edges for ±60° and 0° of roll', () => {
    // Arrange
    const g = pfdGeometry(346);
    const rolls = [60, -60, 0];

    // Act
    const out = rolls.map((roll) => attitude(g, roll).horizon);

    // Assert
    expect(out).toEqual([
      'M196.0 52.0L114.0 194.0',
      'M114.0 52.0L196.0 194.0',
      'M242.0 123.0L68.0 123.0',
    ]);
  });

  it('fills the sky above the horizon and the ground below it at level flight', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = attitude(g, 0);

    // Assert
    expect(out.sky).toBe('M68.0 52.0L242.0 52.0L242.0 123.0L68.0 123.0Z');
    expect(out.ground).toBe('M242.0 123.0L242.0 194.0L68.0 194.0L68.0 123.0Z');
  });
});

describe('attitude ladder', () => {
  it('drops the rungs that would leave the window, and numbers those at 10° at both ends', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = attitude(g, 0);

    // Assert
    expect((out.ladder.match(/M/g) ?? []).length).toBe(11);
    expect(out.labels.map((l) => l.text)).toEqual(['10', '10', '10', '10']);
  });
});

describe('attitude pointer', () => {
  it('is a triangle at the top of the scale for level flight', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = attitude(g, 0).pointer;

    // Assert
    expect(out).toBe('M155.0 66.0L150.9 76.2L159.1 76.2Z');
  });
});

describe('bankScalePath', () => {
  it('ticks ±10, 20, 30, 45 and 60°, longer at 30° and 60°', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = bankScalePath(g);

    // Assert
    expect((out.match(/M/g) ?? []).length).toBe(10);
    expect(out.startsWith('M103.9 93.5L94.4 88.0')).toBe(true);
  });
});

describe('bankIndexPath', () => {
  it('is a triangle at the top of the scale', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = bankIndexPath(g);

    // Assert
    expect(out).toBe('M155.0 64.0l-6 -9h12Z');
  });
});

describe('windowRect', () => {
  it('is the attitude window with its rounded corners', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = windowRect(g);

    // Assert
    expect(out).toEqual({ x: 68, y: 52, width: 174, height: 142, rx: 12 });
  });
});

describe('fpvAt', () => {
  it('stands at the window centre with no climb and no drift', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = fpvAt(g, 0, { fpaDeg: 0, driftDeg: 0 });

    // Assert
    expect(out).toEqual([155, 123]);
  });

  it('moves up the climb angle and along the drift at the ladder scale, rolled with the sky', () => {
    // Arrange
    const g = pfdGeometry(346);
    const cases = [0, 90];

    // Act
    const out = cases.map((roll) => fpvAt(g, roll, { fpaDeg: 5, driftDeg: 10 }).map(Math.round));

    // Assert
    expect(out).toEqual([
      [191, 105],
      [137, 87],
    ]);
  });

  it('stays whole inside the window at the right and at the bottom', () => {
    // Arrange
    const g = pfdGeometry(346);
    const cases = [
      { fpaDeg: 0, driftDeg: 40 },
      { fpaDeg: -30, driftDeg: 0 },
    ];

    // Act
    const out = cases.map((fpv) => fpvAt(g, 0, fpv));

    // Assert
    expect(out).toEqual([
      [224, 123],
      [155, 189],
    ]);
  });
});

describe('fpvPath', () => {
  it('draws a circle with two wings and a fin', () => {
    // Arrange
    const at: [number, number] = [155, 123];

    // Act
    const out = fpvPath(at);

    // Assert
    expect(out).toBe(
      'M150.0 123.0A5.0 5.0 0 1 0 160.0 123.0A5.0 5.0 0 1 0 150.0 123.0' +
        'M150.0 123.0h-13M160.0 123.0h13M155.0 118.0v-7',
    );
  });
});
