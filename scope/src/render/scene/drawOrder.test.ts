import { describe, expect, it } from 'bun:test';

import { type Chart, type ChartItem, chartOf, type ItemPart } from '../../lib/chart';
import { DRAW_STACK, type ScopeLayer, type StyledLayer, visibleLayers } from '../../lib/layers';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import { POINT_LAYERS } from '../../lib/mapsetFormat';
import {
  type ChartPath,
  drawnPointsOf,
  type Network,
  ownersOf,
  topologyOf,
} from '../../lib/topology';
import type { LabelDensity } from '../../state/settingsDefaults';
import { type Batch, LINE_STRIDE, MARKER_STRIDE, TEXT_STRIDE } from '../protocol';
import { CHART_SLICES, SLOT_ORDER, type Slots, sliceSlots } from '../slots';
import { atlas } from './atlasFixture';
import { buildChart } from './chart';
import { buildCoast, buildRings } from './static';

const project = (lat: number, lon: number) => ({ x: lon, y: lat });
const at = (layer: ScopeLayer) => DRAW_STACK.indexOf(layer);
const isPoint = (layer: ScopeLayer): layer is (typeof POINT_LAYERS)[number] =>
  (POINT_LAYERS as readonly string[]).includes(layer);
const CHART_LAYERS: StyledLayer[] = CHART_SLICES.flatMap((s) => s.layers);

/** An item of `layer`, one glyph in its name, sitting at x = its place in the stack. */
function itemAt(layer: StyledLayer): ChartItem {
  const x = at(layer);
  const part: ItemPart = isPoint(layer)
    ? { geometry: { type: 'Point', coordinates: [x, 0] }, properties: { layer, id: 'Q' } }
    : {
        geometry: {
          type: 'LineString',
          coordinates: [
            [x, 0],
            [x + 0.01, 0],
          ],
        },
        properties: { layer, name: 'Q' },
      };
  return { key: layer, layer, parts: [part] };
}

/** A slice of the chart built as the scope builds it. */
function sliceOf(chart: Chart, layers: readonly StyledLayer[], labelDensity: LabelDensity) {
  const topology = topologyOf(chart);
  const drawnPoints = () => drawnPointsOf(topology, layers);
  return buildChart({ topology, drawnPoints, project, layers, labelDensity, atlas });
}

/** Everything the scope draws from the map, as the effects post it. */
function mapSlots(chart: Chart): Slots {
  const slots: Slots = {};
  for (const slice of CHART_SLICES) {
    const layers = visibleLayers(
      slice.layers,
      () => true,
      () => true,
    );
    const built = sliceOf(chart, layers, 'dense');
    Object.assign(slots, sliceSlots(slice, built));
  }
  const coastX = at('coast');
  const coast = {
    lines: [
      [
        [coastX, 0],
        [coastX + 0.01, 0],
      ] as [number, number][],
    ],
  };
  Object.assign(slots, buildCoast({ shown: true, coast, project }));
  const ringX = at('rings');
  const ringPath = () => [
    { x: ringX, y: 0 },
    { x: ringX + 0.01, y: 0 },
  ];
  Object.assign(slots, buildRings({ shown: true, rangeNm: 5, ringExtentNm: 5, ringPath, atlas }));
  return slots;
}

/** The x each instance is anchored at, in the order the renderer draws them. */
function xsInDrawOrder(slots: Slots, kind: Batch['kind']): number[] {
  const stride = { lines: LINE_STRIDE, markers: MARKER_STRIDE, text: TEXT_STRIDE }[kind];
  return SLOT_ORDER.flatMap((name) => slots[name] ?? [])
    .filter((b) => b.kind === kind)
    .flatMap((b) => Array.from({ length: b.count }, (_, i) => Math.round(b.data[i * stride] ?? 0)));
}

describe('the draw order of the chart', () => {
  const chart = CHART_LAYERS.map(itemAt);
  const behind = DRAW_STACK.toReversed();
  const unlabelled: ReadonlySet<ScopeLayer> = new Set(['fir', 'adiz', 'dct', 'hold', 'coast']);

  it('draws lines back to front through the stack, the base map first', () => {
    // Arrange
    const lineLayers = behind.filter((l) => !isPoint(l) && l !== 'hold');

    // Act
    const slots = mapSlots(chart);

    // Assert
    expect(xsInDrawOrder(slots, 'lines')).toEqual(lineLayers.map(at));
  });

  it('draws the markers after every line, back to front', () => {
    // Arrange
    const pointLayers = behind.filter(isPoint);

    // Act
    const slots = mapSlots(chart);

    // Assert
    expect(xsInDrawOrder(slots, 'markers')).toEqual(pointLayers.map(at));
  });

  it('draws every label after every line and marker, back to front, the ring labels first', () => {
    // Arrange
    const labelled = behind.filter((l) => !unlabelled.has(l));

    // Act
    const slots = mapSlots(chart);

    // Assert
    expect(xsInDrawOrder(slots, 'text')).toEqual(labelled.map(at));
  });
});

const nameOf = (p: ChartPath) =>
  `${p.layer} ${'name' in p.part.properties ? p.part.properties.name : ''}`;

/** The vertices strictly inside another path's edge, which is one line traced with two spacings. */
function tracesOf(network: Network): string[] {
  const found: string[] = [];
  for (const p of network.paths) {
    for (let i = 1; i < p.coordinates.length; i++) {
      const [ax = 0, ay = 0] = p.coordinates[i - 1] ?? [];
      const [bx = 0, by = 0] = p.coordinates[i] ?? [];
      for (const q of network.paths.filter((other) => other !== p)) {
        for (const [vx = 0, vy = 0] of q.coordinates) {
          const [dx, dy, wx, wy] = [bx - ax, by - ay, vx - ax, vy - ay];
          const t = (wx * dx + wy * dy) / (dx * dx + dy * dy);
          if (Math.abs(dx * wy - dy * wx) < 1e-9 && t > 1e-9 && t < 1 - 1e-9) {
            found.push(`${nameOf(q)} at ${vx},${vy} on ${nameOf(p)}`);
          }
        }
      }
    }
  }
  return found;
}

/** How many edges each layer owns when every part draws. */
function ownedBy(network: Network): Record<string, number> {
  const owners = ownersOf(network, new Set(network.paths.map((p) => p.part)));
  const counts: Record<string, number> = {};
  for (const path of network.paths) {
    path.edges.forEach((edge, i) => {
      if (owners[edge] !== path.firstOccurrence + i) return;
      counts[path.layer] = (counts[path.layer] ?? 0) + 1;
    });
  }
  return counts;
}

/** Each instance of a lines batch as its unordered pair of ends, rounded to 1e-5. */
function edgeKeys({ data, count }: Batch): string[] {
  return Array.from({ length: count }, (_, i) => {
    const [ax = 0, ay = 0, bx = 0, by = 0] = [0, 1, 4, 5].map((k) =>
      Math.round((data[i * LINE_STRIDE + k] ?? 0) * 1e5),
    );
    return (ax < bx || (ax === bx && ay <= by) ? [ax, ay, bx, by] : [bx, by, ax, ay]).join();
  });
}

describe('the example map set', () => {
  it('draws every layer but hold', () => {
    // Arrange
    const items = chartOf([parseMapSet(EXAMPLE)]);

    // Act
    const undrawn = CHART_LAYERS.filter((layer) => {
      const { lines, markers } = sliceOf(items, [layer], 'off');
      return lines.count + markers.count === 0;
    });

    // Assert
    expect(undrawn).toEqual([]);
  });

  it('draws no segment twice in the area and route slices', () => {
    // Arrange
    const items = chartOf([parseMapSet(EXAMPLE)]);
    const slices = [CHART_SLICES[0], CHART_SLICES[1]];

    // Act
    const keys = slices.map((slice) => edgeKeys(sliceOf(items, slice.layers, 'off').lines));

    // Assert
    expect(keys.map((k) => k.length > 0)).toEqual([true, true]);
    expect(keys.map((k) => new Set(k).size)).toEqual(keys.map((k) => k.length));
  });

  it("has no outline that traces another's line with different vertices", () => {
    // Arrange
    const { areas, routes } = topologyOf(chartOf([parseMapSet(EXAMPLE)]));

    // Act
    const traces = [areas, routes].map(tracesOf);

    // Assert
    expect(traces).toEqual([[], []]);
  });

  it('gives each layer the edges no nearer layer has', () => {
    // Arrange
    const { areas, routes } = topologyOf(chartOf([parseMapSet(EXAMPLE)]));
    const expected = {
      areas: {
        ctr: 4,
        pr: 4,
        tma: 9,
        sector: 5,
        fir: 2,
        dng: 4,
        tra: 4,
        adiz: 2,
        cta: 7,
        advisory: 4,
        civt: 3,
        asr: 1,
      },
      routes: { sid: 1, star: 1, trans: 1, conv: 2, rnav: 1, dct: 1 },
    };

    // Act
    const counts = { areas: ownedBy(areas), routes: ownedBy(routes) };

    // Assert
    expect(counts).toEqual(expected);
  });

  it("draws the edges of a sector's two strata once, in the lower stratum's dash", () => {
    // Arrange
    const items = chartOf([parseMapSet(EXAMPLE)]);

    // Act
    const { lines } = sliceOf(items, ['sector'], 'off');

    // Assert
    expect(lines.count).toBe(6);
    expect(Array.from({ length: lines.count }, (_, i) => lines.data[i * LINE_STRIDE + 10])).toEqual(
      Array.from({ length: lines.count }, () => 6),
    );
  });

  it("draws the edge a stepped area's parts share once", () => {
    // Arrange
    const items = chartOf([parseMapSet(EXAMPLE)]);

    // Act
    const { lines } = sliceOf(items, ['tma'], 'off');

    // Assert
    expect(lines.count).toBe(9);
  });

  it('runs V901 through a hidden fix, and cuts it on either side of a shown one', () => {
    // Arrange
    const items = chartOf([parseMapSet(EXAMPLE)]).filter((item) =>
      /V901|A901|TAVRO/.test(item.key),
    );
    const shown: StyledLayer[][] = [['conv'], ['conv', 'fix']];

    // Act
    const rows = shown.map((layers) => {
      const { lines } = sliceOf(items, layers, 'off');
      return Array.from({ length: lines.count }, (_, i) =>
        Array.from(lines.data.subarray(i * LINE_STRIDE + 20, i * LINE_STRIDE + 22)),
      );
    });

    // Assert
    expect(rows[0]?.every((cut) => cut.every((v) => v === 0))).toBe(true);
    expect(rows[1]?.some(([back]) => back === 7)).toBe(true);
    expect(rows[1]?.some(([, ahead]) => ahead === 7)).toBe(true);
  });
});
