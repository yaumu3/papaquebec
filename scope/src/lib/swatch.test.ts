import { describe, expect, it } from 'bun:test';

import { type Figure } from './figure';
import { LAYER_TABLE } from './layers';
import type { ScopeLayer } from './mapsetFormat';
import { SWATCH_HEIGHT, SWATCH_WIDTH, swatchOf } from './swatch';

const tenth = (v: number) => Math.round(v * 10) / 10;

/** The drawing's extent, to a tenth of a pixel. */
function boundsOf({ strokes }: Figure) {
  const points = strokes.flatMap((stroke) => stroke.points);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(tenth);
}

describe('swatchOf', () => {
  it('draws a line layer across the whole swatch, at its width and with its dash', () => {
    // Arrange
    const layers: ScopeLayer[] = ['conv', 'dct', 'star', 'coast'];

    // Act
    const drawn = layers.map((layer) => swatchOf(layer).figure.strokes[0]);

    // Assert
    expect(drawn.map((s) => [s?.width, s?.dash])).toEqual([
      [1, undefined],
      [0.5, undefined],
      [1, [6, 3]],
      [1, undefined],
    ]);
    expect(drawn.map((s) => s?.points)).toEqual(
      layers.map(() => [
        { x: 0, y: SWATCH_HEIGHT / 2 },
        { x: SWATCH_WIDTH, y: SWATCH_HEIGHT / 2 },
      ]),
    );
  });

  it('colours a layer as the table does, and a hold in its RNAV colour', () => {
    // Arrange
    const layers: ScopeLayer[] = ['ad', 'star', 'hold', 'rings'];

    // Act
    const colours = layers.map((layer) => swatchOf(layer).color);

    // Assert
    expect(colours).toEqual([
      LAYER_TABLE.ad.style.color,
      LAYER_TABLE.star.style.color,
      LAYER_TABLE.hold.style.rnavColor,
      LAYER_TABLE.rings.style.color,
    ]);
  });

  it('closes the markers and the racetrack, and leaves lines and the arc open', () => {
    // Arrange
    const layers: ScopeLayer[] = ['ad', 'navaid', 'fix', 'hold', 'conv', 'rings'];

    // Act
    const closed = layers.map((layer) => swatchOf(layer).figure.strokes[0]?.closed);

    // Assert
    expect(closed).toEqual([true, true, true, true, false, false]);
  });

  it('sizes each form to its place in the swatch', () => {
    // Arrange
    const layers: ScopeLayer[] = ['ad', 'navaid', 'fix', 'vfr', 'hold'];

    // Act
    const bounds = layers.map((layer) => boundsOf(swatchOf(layer).figure));

    // Assert
    expect(bounds).toEqual([
      [8.5, 15.5, 1.5, 8.5],
      [8.5, 15.5, 1, 9],
      [8.5, 15.5, 1, 7.5],
      [9.4, 14.6, 2, 6.9],
      [3.5, 20.5, 2.5, 7.5],
    ]);
  });

  it('bends the rings up from the corners of the swatch', () => {
    // Arrange
    const { figure } = swatchOf('rings');

    // Act
    const bounds = boundsOf(figure);

    // Assert
    expect(bounds).toEqual([2, 22, 3.6, 9]);
  });
});
