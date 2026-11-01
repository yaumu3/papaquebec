import { describe, expect, it } from 'bun:test';

import type { Chart, ChartItem } from '../../lib/chart';
import {
  DRAW_STACK,
  isPointStyle,
  LABEL_DENSITIES,
  type LabelDensity,
  LAYER_TABLE,
} from '../../lib/layers';
import { isChartLayer, isRouteLayer, type Layer } from '../../lib/mapsetFormat';
import {
  airway,
  box,
  edges,
  glyphs,
  itemOf,
  line,
  packed,
  partOf,
  point,
  polygon,
  type Position,
  sceneOf,
  type Segment,
  segments,
  single,
  spelled,
  stopAt,
  triangle,
} from './chartFixture';

const PLACE = 5;

describe('the lines of the chart', () => {
  it('refines a layer by the kind of the part, and by an upper stratum', () => {
    // Arrange
    const rows: { layer: Layer; extra?: object; pattern: number[] }[] = [
      { layer: 'pr', pattern: [4, 3, 0, 0] },
      { layer: 'pr', extra: { kind: 'P' }, pattern: [0, 0, 0, 0] },
      { layer: 'tma', pattern: [0, 0, 0, 0] },
      { layer: 'tma', extra: { kind: 'MIL' }, pattern: [8, 3, 0, 0] },
      { layer: 'sector', pattern: [6, 4, 0, 0] },
      { layer: 'sector', extra: { lower: 'FL335' }, pattern: [12, 4, 0, 0] },
      { layer: 'sector', extra: { lower: 'SFC' }, pattern: [6, 4, 0, 0] },
      { layer: 'cta', extra: { kind: 'PCA' }, pattern: [12, 6, 0, 0] },
    ];
    const items = rows.map((r) =>
      itemOf(r.layer, partOf(r.layer, line([0, 0], [0.01, 0]), r.extra)),
    );

    // Act
    const drawn = items.map((item) => segments(sceneOf([item]).shapes().lines)[0]);

    // Assert
    expect(drawn.map((s) => s?.pattern)).toEqual(rows.map((r) => r.pattern));
  });

  it('runs the dash on across a vertex', () => {
    // Arrange
    const item = single('fir', line([0, 0], [0.03, 0], [0.03, 0.04]));

    // Act
    const [first, second] = segments(sceneOf([item]).shapes().lines);

    // Assert
    expect(first?.along).toBe(0);
    expect(second?.along).toBeCloseTo(0.03, 6);
  });

  it('draws a line area open, and a polygon along its ring without closing it again', () => {
    // Arrange
    const open = single('sector', line([0, 0], [1, 0], [1, 1]));
    const closed = single('ctr', polygon(triangle(0)));

    // Act
    const counts = [open, closed].map((item) => sceneOf([item]).shapes().lines.count);

    // Assert
    expect(counts).toEqual([2, 3]);
  });

  it('draws the holes of a polygon and every part of an item', () => {
    // Arrange
    const holed = single('tma', polygon(triangle(0), triangle(0.5)));
    const stepped = itemOf(
      'tma',
      partOf('tma', polygon(triangle(0))),
      partOf('tma', polygon(triangle(2))),
    );

    // Act
    const counts = [holed, stepped].map((item) => sceneOf([item]).shapes().lines.count);

    // Assert
    expect(counts).toEqual([6, 6]);
  });

  it('draws nothing for a layer that is not among those shown', () => {
    // Arrange
    const scene = sceneOf([single('ctr', polygon(triangle(0)))], { layers: ['fir', 'sid'] });

    // Act
    const { lines, markers } = scene.shapes();

    // Assert
    expect([lines.count, markers.count, scene.pointLabels().text.count]).toEqual([0, 0, 0]);
  });

  it("draws an edge two layers share once, in the front layer's colour, and hands it down when the front layer is hidden", () => {
    // Arrange
    const chart = [
      single('fir', line([0, 0], [1, 0], [0, 1])),
      single('tma', line([0, 0], [1, 0], [1, 1])),
    ];
    const rows: Layer[][] = [['tma', 'fir'], ['fir']];
    const fir = packed('#606060');
    const tma = packed('#5e3a3a');

    // Act
    const drawn = rows.map((layers) => sceneOf(chart, { layers }).shapes().lines);

    // Assert
    expect(drawn.map((batch) => segments(batch).map((s) => s.color))).toEqual([
      [fir, tma, tma],
      [fir, fir],
    ]);
    expect(drawn.map(edges)).toEqual([
      ['1,0>0,1', '0,0>1,0', '1,0>1,1'],
      ['0,0>1,0', '1,0>0,1'],
    ]);
  });

  it("draws the footprint two strata share once, with the lower stratum's dash, whichever part comes first", () => {
    // Arrange
    const lower = partOf('sector', polygon(box(0, 1)));
    const upper = partOf('sector', polygon(box(0, 1)), { lower: 'FL335' });
    const orders = [
      [lower, upper],
      [upper, lower],
    ];

    // Act
    const dashes = orders.map((parts) =>
      segments(sceneOf([itemOf('sector', ...parts)]).shapes().lines).map((s) => s.pattern[0]),
    );

    // Assert
    expect(dashes).toEqual([
      [6, 6, 6, 6],
      [6, 6, 6, 6],
    ]);
  });

  it('splits a path at an edge it shares, and restarts the dash in the next run', () => {
    // Arrange
    const chart = [
      single('fir', line([0, 0], [1, 0], [2, 0], [3, 0], [4, 0])),
      single('tma', line([1, 0], [2, 0])),
    ];

    // Act
    const { lines } = sceneOf(chart).shapes();

    // Assert
    expect(segments(lines).map((s) => `${s.a.x}:${s.along}`)).toEqual(['0:0', '2:0', '3:1', '1:0']);
  });
});

/** Whether any part of a segment shows at `pxPerNm`, by the line shader's rule for the cuts. */
function visibleAt(s: Segment, pxPerNm: number): boolean {
  const [back = 0, ahead = 0, cutBack = 0, cutAhead = 0] = s.span;
  const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) * pxPerNm;
  const from = cutBack ? Math.max(0, (cutBack - back * pxPerNm) / len) : 0;
  const to = cutAhead ? Math.min(1, 1 - (cutAhead - ahead * pxPerNm) / len) : 1;
  return from <= to;
}

const route = (...at: Position[]) => airway('conv', 'R', ...at);

describe('routes stop short of points', () => {
  const conv = packed('#82573c');
  const cutsOf = (chart: Chart, options: Parameters<typeof sceneOf>[1] = {}) =>
    segments(sceneOf(chart, options).shapes().lines)
      .filter((s) => s.color.every((c, k) => c === conv[k]))
      .map((s) => s.span);

  it('cuts a route back at a stop on either side of it', () => {
    // Arrange
    const chart = [route([0, 0], [1, 0], [2, 0]), stopAt('fix', [1, 0])];

    // Act
    const cuts = cutsOf(chart, { layers: ['conv', 'fix'] });

    // Assert
    const ways = cuts.map(([, , back = 0, ahead = 0]) => `${back > 0},${ahead > 0}`);
    expect(ways.toSorted()).toEqual(['false,true', 'true,false']);
  });

  it('measures the way back and ahead along the whole span, across vertices and runs', () => {
    // Arrange
    const rows: [Chart, Layer[], string[]][] = [
      [
        [route([0, 0], [1, 0], [3, 0], [7, 0]), stopAt('fix', [0, 0]), stopAt('navaid', [7, 0])],
        ['conv', 'fix', 'navaid'],
        ['0,6,7,9', '1,4,7,9', '3,0,7,9'],
      ],
      [
        [
          route([0, 0], [1, 0], [3, 0], [4, 0], [6, 0]),
          airway('sid', 'S', [1, 0], [3, 0]),
          stopAt('fix', [0, 0]),
          stopAt('fix', [6, 0]),
        ],
        ['sid', 'conv', 'fix'],
        ['0,5,7,7', '3,2,7,7', '4,0,7,7'],
      ],
      [
        [route([0, 0], [2, 0], [3, 0], [5, 0]), stopAt('fix', [2, 0])],
        ['conv', 'fix'],
        ['0,0,0,7', '0,2,7,0', '1,0,7,0'],
      ],
    ];

    // Act
    const spans = rows.map(([chart, layers]) =>
      cutsOf(chart, { layers }).map((span) => span.map((v) => Math.round(v * 1000) / 1000).join()),
    );

    // Assert
    expect(spans).toEqual(rows.map(([, , expected]) => expected));
  });

  it('writes no cut where no point stands at a vertex, where the point layer is hidden, or the navaid is out of range', () => {
    // Arrange
    const through = route([0, 0], [1, 0], [2, 0]);
    const rows: [Chart, Parameters<typeof sceneOf>[1]][] = [
      [[through, stopAt('fix', [5, 5])], {}],
      [[through, stopAt('fix', [1, 0])], { layers: ['conv'] }],
      [[through, stopAt('navaid', [1, 0])], { inRange: false }],
    ];

    // Act
    const cuts = rows.map(([chart, options]) => cutsOf(chart, options));

    // Assert
    expect(cuts.map((list) => list.length > 0)).toEqual([true, true, true]);
    expect(cuts.map((list) => list.flat().every((v) => v === 0))).toEqual([true, true, true]);
  });

  it('draws a span shorter than its two cuts at no zoom where it is short, and at a closer one, from one batch', () => {
    // Arrange
    const chart = [route([0, 0], [0.001, 0]), stopAt('fix', [0, 0]), stopAt('fix', [0.001, 0])];
    const drawn = segments(sceneOf(chart).shapes().lines);
    const [far, near] = [1000, 100_000];

    // Act
    const shown = [far, near].map((zoom) => drawn.some((s) => visibleAt(s, zoom)));

    // Assert
    expect(shown).toEqual([false, true]);
  });

  it('reads the drawn points only for a route or a point layer', () => {
    // Arrange
    const chart = [route([0, 0], [1, 0]), single('tma', polygon(triangle(0)))];
    const rows: Layer[][] = [['tma'], [], ['conv'], ['fix']];
    const reads = rows.map(() => 0);
    const scenes = rows.map((layers, i) =>
      sceneOf(chart, {
        layers,
        onPointsRead: () => {
          reads[i] = (reads[i] ?? 0) + 1;
        },
      }),
    );

    // Act
    for (const scene of scenes) scene.shapes();

    // Assert
    expect(reads.map((n) => n > 0)).toEqual([false, false, true, true]);
  });

  it('does not cut an area outline where a point stands on its vertex', () => {
    // Arrange
    const chart = [single('tma', polygon(triangle(0))), stopAt('fix', [0.01, 0])];

    // Act
    const { lines } = sceneOf(chart).shapes();

    // Assert
    expect(segments(lines).every((s) => s.span.every((v) => v === 0))).toBe(true);
    expect(lines.count).toBe(3);
  });

  it('does not stop a route at a hidden fix, and gives the fix no marker or label', () => {
    // Arrange
    const chart = [route([0, 0], [1, 0], [2, 0]), stopAt('fix', [1, 0], 'stop')];
    const rows = [[], ['stop']];

    // Act
    const built = rows.map((hidden) => {
      const scene = sceneOf(chart, { hidden });
      return { shapes: scene.shapes(), labels: scene.pointLabels().text };
    });

    // Assert
    expect(built.map((b) => b.shapes.markers.count)).toEqual([1, 0]);
    expect(built.map((b) => b.labels.count)).toEqual([1, 0]);
    expect(
      built.map((b) => segments(b.shapes.lines).some((s) => s.span.some((v) => v !== 0))),
    ).toEqual([true, false]);
  });
});

describe('the navaids', () => {
  const at: Position = [139.5, 35.5];
  const drawing = (kind: string | undefined, positions: Position[] = [at]) => {
    const parts = positions.map((p) =>
      partOf('navaid', point(p), kind === undefined ? {} : { kind }),
    );
    const { lines, markers } = sceneOf([itemOf('navaid', ...parts)]).shapes();
    return JSON.stringify([Array.from(lines.data), Array.from(markers.data)]);
  };

  it('draws each navaid kind as a symbol of its own', () => {
    // Arrange
    const kinds = ['VOR', 'DME', 'VOR/DME', 'TACAN', 'VORTAC', 'NDB'];

    // Act
    const drawn = kinds.map((kind) => drawing(kind));

    // Assert
    expect(new Set(drawn).size).toBe(kinds.length);
  });

  it('draws an unknown kind and a missing one as the default circle', () => {
    // Arrange
    const kinds = ['TVOR', 'vor', undefined];

    // Act
    const drawn = kinds.map((kind) => drawing(kind));

    // Assert
    expect(drawn).toEqual(kinds.map(() => drawing(undefined)));
  });

  it("draws every part of a navaid with its first part's kind", () => {
    // Arrange
    const east: Position = [139.6, 35.5];
    const mixed = itemOf(
      'navaid',
      partOf('navaid', point(at), { kind: 'VOR' }),
      partOf('navaid', point(east), { kind: 'NDB' }),
    );

    // Act
    const drawn = sceneOf([mixed]).shapes();

    // Assert
    const { lines, markers } = sceneOf([
      itemOf(
        'navaid',
        partOf('navaid', point(at), { kind: 'VOR' }),
        partOf('navaid', point(east), { kind: 'VOR' }),
      ),
    ]).shapes();
    expect([Array.from(drawn.lines.data), Array.from(drawn.markers.data)]).toEqual([
      Array.from(lines.data),
      Array.from(markers.data),
    ]);
  });
});

describe('the point labels', () => {
  it('prints a point by its ident, not by its name', () => {
    // Arrange
    const item = single('ad', point([0, 0]), { name: 'PAPAQ' });

    // Act
    const { text } = sceneOf([item]).pointLabels();

    // Assert
    expect(spelled(text)).toBe('Q');
  });

  it('labels each part of a point item where it sits', () => {
    // Arrange
    const west = partOf('vfr', point([0, 0]));
    const east = partOf('vfr', point([PLACE, 0]));
    const scene = sceneOf([itemOf('vfr', west, east)]);

    // Act
    const { text } = scene.pointLabels();

    // Assert
    expect(scene.shapes().markers.count).toBe(2);
    expect(glyphs(text).map((g) => g.at.x)).toEqual([0, PLACE]);
  });

  it('draws a route layer as lines only', () => {
    // Arrange
    const scene = sceneOf([airway('conv', 'R', [0, 0], [0.01, 0])]);

    // Act
    const { lines, markers } = scene.shapes();

    // Assert
    expect([lines.count, markers.count]).toEqual([1, 0]);
  });
});

const placeholder = (layer: Layer): ChartItem => {
  const style = LAYER_TABLE[layer].style;
  const geometry =
    isPointStyle(style) || layer === 'hold'
      ? point([0, 0])
      : isRouteLayer(layer)
        ? line([0, 0], [1, 0])
        : polygon(box(0, 6));
  return itemOf(layer, partOf(layer, geometry));
};

/** How many glyphs the three label slots draw for a lone item of `layer`. */
const labelled = (layer: Layer, density: LabelDensity) => {
  const scene = sceneOf([placeholder(layer)], { layers: [layer], density });
  const texts = [scene.pointLabels().text, scene.routeLabels().text, scene.areaLabels().text];
  return texts.reduce((sum, text) => sum + text.count, 0);
};

describe('where a layer begins to be labelled', () => {
  it('is the density the layer table gives, and a layer without a label never draws one', () => {
    // Arrange
    const layers = DRAW_STACK.filter(isChartLayer);
    const expected = layers.map((layer) => {
      const from = LAYER_TABLE[layer].style.label?.from;
      return LABEL_DENSITIES.map(
        (d) => from !== undefined && LABEL_DENSITIES.indexOf(d) >= LABEL_DENSITIES.indexOf(from),
      );
    });

    // Act
    const drawn = layers.map((layer) => LABEL_DENSITIES.map((d) => labelled(layer, d) > 0));

    // Assert
    expect(drawn).toEqual(expected);
  });
});
