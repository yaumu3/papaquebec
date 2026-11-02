import { describe, expect, it } from 'bun:test';

import { CHART_COLORS, PALETTE } from '../../design/palette';
import {
  airway,
  box,
  itemOf,
  line,
  markers,
  packed,
  partOf,
  point,
  polygon,
  type Position,
  sceneOf,
  type SceneOptions,
  segments,
  single,
  spelled,
  stopAt,
} from './chartFixture';

const navaid = (kind: string, at: Position) =>
  itemOf('navaid', partOf('navaid', point(at), { kind }));
const WEST = () => () => -7;

/** A marker without its colour. */
const shapeOf = ({ at, size, shape }: ReturnType<typeof markers>[number]) => ({ at, size, shape });

const grey = packed(PALETTE.hover);
const faint = packed(CHART_COLORS.hoverFaint);
const bright = packed(CHART_COLORS.pointHover);
const brightFaint = packed(CHART_COLORS.pointHoverFaint);

const area = (...parts: ReturnType<typeof line>[]) =>
  itemOf('tma', ...parts.map((geometry) => partOf('tma', geometry)));
const fix = (...at: Position[]) => itemOf('fix', ...at.map((p) => partOf('fix', point(p))));
const hold = (at: Position, extra: Parameters<typeof partOf>[2] = { inboundTrue: 90 }) =>
  itemOf('hold', partOf('hold', point(at), extra));

type Pointing = Parameters<ReturnType<typeof sceneOf>['traces']>[0];

/** The traces of what is pointed at and searched, in a scene of the items they name. */
const tracesOf = (pointing: Pointing, options: SceneOptions = {}) =>
  sceneOf(
    [...(pointing.pointedAt ? [pointing.pointedAt] : []), ...pointing.searched],
    options,
  ).traces(pointing);

describe('the traces', () => {
  it('draws every outline of every part, 2 px wide and solid in the hover grey', () => {
    // Arrange
    const stepped = area(polygon(box(0, 1), box(0.25, 0.75)), line([5, 0], [6, 0], [6, 1]));

    // Act
    const { pointed } = tracesOf({ pointedAt: stepped, searched: [] });

    // Assert
    const drawn = segments(pointed.lines);
    expect(drawn).toHaveLength(4 + 4 + 2);
    expect(drawn.map((s) => s.width)).toEqual(drawn.map(() => 2));
    expect(drawn.map((s) => s.pattern)).toEqual(drawn.map(() => [0, 0, 0, 0]));
    expect(drawn.map((s) => s.color)).toEqual(drawn.map(() => grey));
    expect(pointed.markers.count).toBe(0);
  });

  it('does not cut a route back at the points it passes', () => {
    // Arrange
    const route = airway('conv', 'R', [0, 0], [1, 0], [2, 0]);
    const chart = [route, stopAt('fix', [1, 0])];

    // Act
    const { pointed } = sceneOf(chart).traces({ pointedAt: route, searched: [] });

    // Assert
    expect(segments(pointed.lines).flatMap((s) => s.span)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('draws a point as the chart draws it, one for each part, brighter than the hover grey', () => {
    // Arrange
    const layers = ['ad', 'fix', 'vfr'] as const;
    const items = layers.map((layer) =>
      itemOf(layer, partOf(layer, point([1, 2])), partOf(layer, point([3, 4]))),
    );
    const chartMarkers = items.map((item) => markers(sceneOf([item]).shapes().markers));

    // Act
    const traced = items.map((pointedAt) => tracesOf({ pointedAt, searched: [] }).pointed.markers);

    // Assert
    expect(traced.map((batch) => markers(batch).map(shapeOf))).toEqual(
      chartMarkers.map((rows) => rows.map(shapeOf)),
    );
    expect(traced.flatMap((batch) => markers(batch).map((m) => m.color))).toEqual(
      traced.flatMap((batch) => markers(batch).map(() => bright)),
    );
  });

  it('draws a navaid as its own symbol, each part its own kind', () => {
    // Arrange
    const mixed = itemOf(
      'navaid',
      partOf('navaid', point([1, 2]), { kind: 'VORTAC' }),
      partOf('navaid', point([3, 4]), { kind: 'NDB' }),
    );
    const alone = (item: ReturnType<typeof navaid>) =>
      tracesOf({ pointedAt: item, searched: [] }).pointed;
    const first = alone(navaid('VORTAC', [1, 2]));
    const second = alone(navaid('NDB', [3, 4]));

    // Act
    const { pointed } = tracesOf({ pointedAt: mixed, searched: [] });

    // Assert
    expect(first.strokes.count).not.toBe(second.strokes.count);
    expect(segments(pointed.strokes)).toEqual([
      ...segments(first.strokes),
      ...segments(second.strokes),
    ]);
    expect(markers(pointed.markers)).toEqual([
      ...markers(first.markers),
      ...markers(second.markers),
    ]);
  });

  it("draws a pointed hold as the chart's racetrack outline, without its chevrons", () => {
    // Arrange
    const pointedAt = hold([1, 2]);
    const chart = segments(sceneOf([pointedAt]).shapes().lines);
    const outline = chart.filter((s) => s.width === 1);

    // Act
    const { pointed } = tracesOf({ pointedAt, searched: [] });

    // Assert
    const drawn = segments(pointed.lines);
    expect(chart.length).toBeGreaterThan(outline.length);
    expect(drawn.map((s) => [s.offsetA, s.offsetB])).toEqual(
      outline.map((s) => [s.offsetA, s.offsetB]),
    );
    expect(drawn.map((s) => [s.width, s.color])).toEqual(drawn.map(() => [2, grey]));
    expect(drawn.map((s) => s.a)).toEqual(drawn.map(() => ({ x: 1, y: 2 })));
  });

  it('turns a pointed hold without inboundTrue by the declination at its fix', () => {
    // Arrange
    const pointedAt = hold([1, 2], { inboundMag: 97 });

    // Act
    const { pointed } = tracesOf({ pointedAt, searched: [] }, { declinationAt: WEST });

    // Assert
    const inbound = segments(pointed.lines).at(-1);
    expect(inbound?.offsetA.x).toBeCloseTo(-18);
    expect(inbound?.offsetA.y).toBeCloseTo(0);
  });

  it('draws what the search names at half strength, a point as its own symbol', () => {
    // Arrange
    const searched = [area(line([0, 0], [1, 0], [1, 1])), fix([5, 6])];
    const chartMarkers = markers(sceneOf([fix([5, 6])]).shapes().markers);

    // Act
    const { searched: found } = tracesOf({ pointedAt: null, searched });

    // Assert
    const drawn = segments(found.lines);
    expect(drawn.map((x) => x.color)).toEqual(drawn.map(() => faint));
    expect(drawn.map((x) => [x.width, x.pattern])).toEqual(drawn.map(() => [2, [0, 0, 0, 0]]));
    expect(markers(found.markers).map(shapeOf)).toEqual(chartMarkers.map(shapeOf));
    expect(markers(found.markers).map((m) => m.color)).toEqual([brightFaint]);
    expect(faint[3]).toBeCloseTo(128 / 255, 2);
    expect(brightFaint[3]).toBeCloseTo(128 / 255, 2);
  });

  it('draws a hold the search names as its racetrack at half strength', () => {
    // Arrange
    const searched = [hold([1, 2], { turn: 'L', inboundTrue: 0 })];

    // Act
    const { searched: found } = tracesOf({ pointedAt: null, searched });

    // Assert
    const drawn = segments(found.lines);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.map((s) => [s.width, s.color])).toEqual(drawn.map(() => [2, faint]));
  });

  it('puts the search first and what is pointed at over it, an item in both drawn in both', () => {
    // Arrange
    const both = fix([1, 2]);
    const onlySearched = area(line([0, 0], [1, 0]));

    // Act
    const { searched, pointed } = tracesOf({ pointedAt: both, searched: [onlySearched, both] });

    // Assert
    expect(segments(searched.lines)).toHaveLength(1);
    expect(markers(searched.markers).map((m) => m.color)).toEqual([brightFaint]);
    expect(pointed.lines.count).toBe(0);
    expect(markers(pointed.markers).map((m) => m.color)).toEqual([bright]);
  });

  it('gives only empty batches when nothing is searched or pointed at', () => {
    // Arrange
    const nothing = { pointedAt: null, searched: [] };

    // Act
    const { searched, pointed, litTraces, litPoints } = tracesOf(nothing);

    // Assert
    const batches = [...Object.values(searched), ...Object.values(pointed)];
    expect(batches.map((b) => b.count)).toEqual([0, 0, 0, 0, 0, 0]);
    expect([litTraces.length, litPoints.length]).toEqual([0, 0]);
  });

  it("puts a route's highlight in the traces, and none among the traced points", () => {
    // Arrange
    const route = airway('conv', 'V901', [0, 0], [2, 0]);

    // Act
    const { litTraces, litPoints } = tracesOf({ pointedAt: route, searched: [] });

    // Assert
    expect(litTraces.map((b) => b.kind)).toEqual(['lines', 'text', 'lines']);
    expect(litTraces.filter((b) => b.kind === 'text').map(spelled)).toEqual(['V901']);
    expect(litPoints).toHaveLength(0);
  });

  it("puts a point's highlight among the traced points, and none in the traces", () => {
    // Arrange
    const pointedAt = single('fix', point([1, 2]));

    // Act
    const { litTraces, litPoints } = tracesOf({ pointedAt, searched: [] });

    // Assert
    expect(litPoints.map((b) => b.kind)).toEqual(['lines', 'text', 'lines']);
    expect(litPoints.filter((b) => b.kind === 'text').map(spelled)).toEqual(['Q']);
    expect(litTraces).toHaveLength(0);
  });
});
