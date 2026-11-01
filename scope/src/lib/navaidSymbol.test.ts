import { describe, expect, it } from 'bun:test';

import type { Figure, Stroke } from './figure';
import type { Vec2 } from './geo';
import { navaidSymbol } from './navaidSymbol';

const SIZE = 12;
const R = SIZE / 2;
const SIN60 = Math.sin(Math.PI / 3);
const KINDS = ['VOR', 'DME', 'VOR/DME', 'TACAN', 'VORTAC', 'NDB'] as const;

const radiusOf = ({ x, y }: Vec2) => Math.hypot(x, y);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const ys = (stroke: Stroke) => stroke.points.map((p) => p.y);
const xs = (stroke: Stroke) => stroke.points.map((p) => p.x);
const outlines = ({ strokes }: Figure) => strokes.filter(({ closed }) => closed);
const outlineAt = (figure: Figure, index: number): Stroke => {
  const stroke = outlines(figure)[index];
  if (!stroke) throw new Error(`no outline ${index}`);
  return stroke;
};
const figureAt = (figures: Figure[], index: number): Figure => {
  const figure = figures[index];
  if (!figure) throw new Error(`no figure ${index}`);
  return figure;
};
const pointAt = (stroke: Stroke, index: number): Vec2 => {
  const point = stroke.points[index];
  if (!point) throw new Error(`no point ${index}`);
  return point;
};

describe('navaidSymbol', () => {
  it('draws each kind as its own symbol', () => {
    // Arrange
    const expected: Record<(typeof KINDS)[number] | 'default', [number[], number, number]> = {
      VOR: [[6], 0, 1],
      DME: [[4], 0, 1],
      'VOR/DME': [[4, 6], 0, 1],
      TACAN: [[12], 0, 1],
      VORTAC: [[12], 3, 1],
      NDB: [[24], 0, 24],
      default: [[24], 0, 1],
    };
    const kinds = [...KINDS, undefined];

    // Act
    const shape = kinds.map((kind) => {
      const figure = navaidSymbol(kind, SIZE);
      const open = figure.strokes.length - outlines(figure).length;
      return [outlines(figure).map((s) => s.points.length), open, figure.discs.length];
    });

    // Assert
    expect(shape).toEqual(kinds.map((kind) => expected[kind ?? 'default']));
  });

  it('draws a VOR as a hexagon at 0.85 r with flat top and bottom', () => {
    // Arrange
    const kind = 'VOR';

    // Act
    const figure = navaidSymbol(kind, SIZE);

    // Assert
    const hexagon = outlineAt(figure, 0);
    expect(hexagon.points.every((p) => Math.abs(radiusOf(p) - 0.85 * R) < 1e-9)).toBe(true);
    expect(Math.max(...xs(hexagon))).toBeCloseTo(0.85 * R);
    expect(Math.min(...ys(hexagon))).toBeCloseTo(-0.85 * R * SIN60);
    expect(ys(hexagon).filter((y) => Math.abs(y - 0.85 * R * SIN60) < 1e-9)).toHaveLength(2);
  });

  it('draws the DME rectangle and the VOR/DME one the same, with the hexagon flush inside', () => {
    // Arrange
    const kinds = ['DME', 'VOR/DME'] as const;

    // Act
    const figures = kinds.map((kind) => navaidSymbol(kind, SIZE));

    // Assert
    const dmeRectangle = outlineAt(figureAt(figures, 0), 0);
    const rectangle = outlineAt(figureAt(figures, 1), 0);
    const hexagon = outlineAt(figureAt(figures, 1), 1);
    expect(dmeRectangle.points).toEqual(rectangle.points);
    expect(Math.max(...xs(rectangle))).toBeCloseTo(0.82 * R * 1.22);
    expect(Math.max(...ys(rectangle))).toBeCloseTo(0.82 * R * SIN60);
    expect(Math.max(...ys(hexagon))).toBeCloseTo(Math.max(...ys(rectangle)));
    expect(Math.min(...ys(hexagon))).toBeCloseTo(Math.min(...ys(rectangle)));
    expect(Math.max(...xs(hexagon))).toBeCloseTo(0.82 * R);
    expect(Math.max(...xs(rectangle))).toBeGreaterThan(Math.max(...xs(hexagon)));
  });

  it('draws a TACAN with lobes out of its upper left, upper right and bottom sides, one outline', () => {
    // Arrange
    const vertexRadius = 0.6 * R;
    const side = vertexRadius;
    const depth = 0.55 * vertexRadius;
    const lobes: [number, Vec2][] = [
      [1, { x: 0, y: 1 }],
      [5, { x: -Math.cos(Math.PI / 6), y: -0.5 }],
      [9, { x: Math.cos(Math.PI / 6), y: -0.5 }],
    ];

    // Act
    const figure = navaidSymbol('TACAN', SIZE);

    // Assert
    const outline = outlineAt(figure, 0);
    const at = (i: number) => pointAt(outline, i % 12);
    for (const [i, normal] of lobes) {
      expect(dist(at(i), at(i + 1))).toBeCloseTo(depth);
      expect(dist(at(i + 1), at(i + 2))).toBeCloseTo(side);
      expect((at(i + 1).x - at(i).x) / depth).toBeCloseTo(normal.x);
      expect((at(i + 1).y - at(i).y) / depth).toBeCloseTo(normal.y);
      expect(dist(at(i), at(i + 3))).toBeCloseTo(side);
    }
  });

  it('draws a VORTAC as the TACAN outline with each lobe filled', () => {
    // Arrange
    const tacan = outlineAt(navaidSymbol('TACAN', SIZE), 0);
    const depth = 0.55 * 0.6 * R;
    const apothem = 0.6 * R * SIN60;

    // Act
    const figure = navaidSymbol('VORTAC', SIZE);

    // Assert
    const fills = figure.strokes.filter(({ closed }) => !closed);
    expect(outlineAt(figure, 0).points).toEqual(tacan.points);
    expect(fills).toHaveLength(3);
    for (const { points, width } of fills) {
      const [from, to] = points;
      if (!from || !to) throw new Error('a fill has two points');
      expect(width).toBeCloseTo(depth);
      expect(dist(from, to)).toBeCloseTo(0.6 * R);
      expect(radiusOf({ x: (from.x + to.x) / 2, y: (to.y + from.y) / 2 })).toBeCloseTo(
        apothem + depth / 2,
      );
    }
  });

  it('draws an NDB as 14 and 9 stipple dots, a small ring and the centre dot', () => {
    // Arrange
    const kind = 'NDB';

    // Act
    const figure = navaidSymbol(kind, SIZE);

    // Assert
    const dots = figure.discs.filter((d) => d.radius === 0.6);
    const radii = dots.map((d) => Math.round(radiusOf(d.at) * 1000) / 1000);
    const [ring] = figure.strokes;
    expect(figure.strokes).toHaveLength(1);
    expect(ring?.points.every((p) => Math.abs(radiusOf(p) - 0.3 * R) < 1e-9)).toBe(true);
    expect(radii.filter((v) => v === R)).toHaveLength(14);
    expect(radii.filter((v) => v === Math.round(0.68 * R * 1000) / 1000)).toHaveLength(9);
  });

  it('draws a circle of 0.75 r for an unknown kind, a missing one and another letter case', () => {
    // Arrange
    const kinds = ['TVOR', undefined, 'vor', ''];

    // Act
    const figures = kinds.map((kind) => navaidSymbol(kind, SIZE));

    // Assert
    for (const figure of figures) {
      const [circle] = figure.strokes;
      expect(figure.strokes).toHaveLength(1);
      expect(circle?.points.every((p) => Math.abs(radiusOf(p) - 0.75 * R) < 1e-9)).toBe(true);
    }
  });

  it('puts a centre dot of 0.9 px at the origin of every kind', () => {
    // Arrange
    const kinds = [...KINDS, undefined];

    // Act
    const centres = kinds.map((kind) =>
      navaidSymbol(kind, SIZE).discs.filter((d) => d.radius === 0.9),
    );

    // Assert
    expect(centres).toEqual(kinds.map(() => [{ at: { x: 0, y: 0 }, radius: 0.9 }]));
  });

  it('strokes every outline and the NDB ring 1.1 px wide', () => {
    // Arrange
    const kinds = [...KINDS, undefined];

    // Act
    const widths = kinds.flatMap((kind) =>
      navaidSymbol(kind, SIZE)
        .strokes.filter(({ closed }) => closed)
        .map(({ width }) => width),
    );

    // Assert
    expect(new Set(widths)).toEqual(new Set([1.1]));
  });
});
