/**
 * The steps of a chart build as pure calls, wired as `render/scene/chartFixture.ts` wires them and
 * as the memos of `state` and `canvas` would run them, each timed apart. Every layer draws, the
 * holds among them, so that the magnetic model is read.
 */
import { pxPerNmFor } from '../../src/canvas/view';
import { type Chart, chartOf, type ChartItem } from '../../src/lib/chart';
import type { GeoPoint, ProjectFn } from '../../src/lib/geo';
import { DRAW_STACK, type LabelDensity, labelReaches, LAYER_TABLE } from '../../src/lib/layers';
import type { MapSetData } from '../../src/lib/mapset';
import { isChartLayer, isPointLayer, type Layer } from '../../src/lib/mapsetFormat';
import { type AreaPlace, areaPlaceOf } from '../../src/lib/pole';
import { pathSpans, type SpansOf } from '../../src/lib/routeSpans';
import { stopCuts } from '../../src/lib/stops';
import { drawnPointsOf, type Topology, topologyOf } from '../../src/lib/topology';
import { drawnItemsOf, everyItemSet, type LayerState } from '../../src/lib/visibility';
import type { Declination } from '../../src/lib/wmm';
import { atlas as fixtureAtlas } from '../../src/render/scene/atlasFixture';
import { type BuiltLabels, buildShapes, CHART_SLICES, sliceOf } from '../../src/render/scene/chart';
import { buildHighlight } from '../../src/render/scene/highlight';
import { buildTraces } from '../../src/render/scene/traces';
import { nmPlane, siteProjection } from '../../src/state/tracks';
import { pct } from './report';

/** JetBrains Mono's advance as a share of its size, as the scope's atlas measures it. */
const ADVANCE_EM = 0.6;
/** The scope's font metrics: label widths decide what fits. */
const ATLAS = { ...fixtureAtlas, advance: fixtureAtlas.fontSize * ADVANCE_EM };

/** The scale labels are settled at: the load test's window at the default range. */
const SETTLED_SCALE = pxPerNmFor(1600, 1000, 40);

/** The density the labels are built at, as the scope starts. */
const LABEL_DENSITY: LabelDensity = 'normal';

const CHART_LAYERS = DRAW_STACK.filter(isChartLayer);

type Slice = (typeof CHART_SLICES)[number];
type StateOf = (layer: Layer) => LayerState;

export interface Step {
  name: string;
  run: () => unknown;
}

const everyLayerOn: StateOf = () => everyItemSet(true);
const fixesOff: StateOf = (layer) => everyItemSet(layer !== 'fix');

/** Every item on but the one of `key`, on `of`. */
const allBut =
  (key: string, of: Layer): StateOf =>
  (layer) =>
    layer === of ? { mode: true, exceptions: new Set([key]) } : everyItemSet(true);

/** What a slice is built from, for what draws under one state of the layers. */
class Stage {
  readonly drawn: readonly ChartItem[];
  readonly points;
  /** The spans as the memo holds them, walked once by whichever build reads them first. */
  readonly spans: SpansOf;

  constructor(
    readonly topology: Topology,
    readonly project: ProjectFn,
    stateOf: StateOf,
  ) {
    this.drawn = drawnItemsOf(topology.chart, CHART_LAYERS, stateOf, () => true);
    this.points = drawnPointsOf(
      topology,
      this.drawn.filter((item) => isPointLayer(item.layer)),
    );
    this.spans = this.freshSpans();
  }

  /** The spans before any build has walked them. */
  freshSpans(): SpansOf {
    return pathSpans(
      stopCuts(this.points, (layer) => LAYER_TABLE[layer].style.size),
      this.project,
    );
  }

  inputOf({ layers }: Slice, routeSpans: SpansOf = this.spans) {
    return {
      topology: this.topology,
      drawnPoints: () => this.points,
      project: this.project,
      routeSpans,
      layers,
      drawnItems: this.drawn.filter((item) => layers.includes(item.layer)),
    };
  }
}

/** Whether the area labels name an item at the density, and so ask for its place. */
function isLabelledArea({ layer }: ChartItem): boolean {
  const { label } = LAYER_TABLE[layer].style;
  return sliceOf(layer).labels === 'areaLabels' && !!label && labelReaches(label, LABEL_DENSITY);
}

const firstOf = (chart: Chart, ...layers: readonly Layer[]): ChartItem => {
  const item = chart.find(({ layer }) => layers.includes(layer));
  if (!item) throw new Error(`the set has nothing on ${layers.join(', ')}`);
  return item;
};

/** Every step of a chart build around `site`, in the order the scope runs them. */
export function chartSteps(data: MapSetData, site: GeoPoint, declination: Declination): Step[] {
  const { project } = nmPlane(siteProjection(site));
  const declinationAt = () => declination;
  const chart = chartOf([data]);
  const topology = topologyOf(chart);
  const stage = new Stage(topology, project, everyLayerOn);
  const places = new Map<string, AreaPlace | undefined>();
  const placeOf = (item: ChartItem) => {
    if (!places.has(item.key)) places.set(item.key, areaPlaceOf(item, project));
    return places.get(item.key);
  };
  const shapesOf = (slice: Slice, on: Stage) =>
    buildShapes(slice, on.inputOf(slice, on.freshSpans()), declinationAt);
  const labelsOf = (slice: Slice, on: Stage) =>
    slice.buildLabels({
      ...on.inputOf(slice),
      labelDensity: LABEL_DENSITY,
      atlas: ATLAS,
      settledScale: () => SETTLED_SCALE,
      placeOf,
      shown: new Map(),
    });
  const sliceBuilt = (slice: Slice, on: Stage) => [shapesOf(slice, on), labelsOf(slice, on)];
  const areaItem = firstOf(chart, 'sector', 'ctr', 'tma');
  const route = firstOf(chart, 'conv', 'rnav', 'sid');
  const routeLabels: BuiltLabels = labelsOf(sliceOf(route.layer), stage);
  const lit = () =>
    buildHighlight(route, {
      spanLabels: routeLabels.spanLabels ?? new Map(),
      areaNames: new Map(),
      topology,
      routeSpans: stage.spans,
      project,
      atlas: ATLAS,
      placeOf,
    });
  const highlight = lit();
  return [
    { name: 'merge', run: () => chartOf([data]) },
    { name: 'topology', run: () => topologyOf(chart) },
    { name: 'drawn items', run: () => drawnItemsOf(chart, CHART_LAYERS, everyLayerOn, () => true) },
    {
      name: 'drawn points',
      run: () =>
        drawnPointsOf(
          topology,
          stage.drawn.filter((i) => isPointLayer(i.layer)),
        ),
    },
    {
      name: 'area places',
      run: () => chart.filter(isLabelledArea).map((item) => areaPlaceOf(item, project)),
    },
    ...CHART_SLICES.map((slice) => ({
      name: `shapes ${slice.shapes}`,
      run: () => shapesOf(slice, stage),
    })),
    ...CHART_SLICES.map((slice) => ({
      name: `labels ${slice.labels}`,
      run: () => labelsOf(slice, stage),
    })),
    { name: 'highlight', run: lit },
    {
      name: 'trace',
      run: () => buildTraces({ pointedAt: route, searched: [], highlight, project, declinationAt }),
    },
    {
      name: 'toggle item',
      run: () =>
        sliceBuilt(
          sliceOf(areaItem.layer),
          new Stage(topology, project, allBut(areaItem.key, areaItem.layer)),
        ),
    },
    {
      name: 'toggle points',
      run: () => {
        const off = new Stage(topology, project, fixesOff);
        return [sliceBuilt(sliceOf('fix'), off), sliceBuilt(sliceOf(route.layer), off)];
      },
    },
  ];
}

/** How many runs to time and how many go before them, to warm the engine. */
interface Runs {
  warmups: number;
  runs: number;
}

/** A step's median and longest run, in ms. */
export function timeOf(
  { run }: Step,
  { warmups, runs }: Runs,
  clock: () => number = () => performance.now(),
) {
  Array.from({ length: warmups }, run);
  const times = Array.from({ length: runs }, () => {
    const start = clock();
    run();
    return clock() - start;
  });
  return { medianMs: pct(times, 50), maxMs: Math.max(...times) };
}
