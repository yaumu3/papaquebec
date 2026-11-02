/** What draws, derived from the topology and each layer's visibility. */

import { batch, createMemo, createRoot } from 'solid-js';

import type { ChartItem } from '../lib/chart';
import { LAYER_TABLE } from '../lib/layers';
import { type Layer, POINT_LAYERS, type ScopeLayer } from '../lib/mapsetFormat';
import { pathLines } from '../lib/pathLines';
import { type AreaPlace, areaPlaceOf } from '../lib/pole';
import { pathSpans, type SpansOf, uncutSpans } from '../lib/routeSpans';
import { stopCuts } from '../lib/stops';
import { type ChartPath, drawnPointsOf } from '../lib/topology';
import { drawnItemsOf, type LayerState, navaidsShownAt, NO_EXCEPTIONS } from '../lib/visibility';
import { topology } from './mapsets';
import { projectionVersion } from './scope';
import { setSettings, settings } from './settings';
import { projectNm } from './tracks';

/** A layer's mode and exceptions as the settings hold them. */
export const layerState = (layer: ScopeLayer): LayerState => ({
  mode: settings.shownLayers[layer],
  exceptions: settings.exceptions[layer] ?? NO_EXCEPTIONS,
});

export function setLayerState(layer: ScopeLayer, { mode, exceptions }: LayerState): void {
  batch(() => {
    setSettings('shownLayers', layer, mode);
    setSettings('exceptions', layer, exceptions);
  });
}

/**
 * These sit in a root of their own: they live as long as the page, like the state they read, and
 * `canvas/hit.ts` reads them outside the scene.
 */
export const { drawnItemsIn, drawnPoints, areaSpans, routeSpans, areaPlace } = createRoot(() => {
  /** Zooming reaches the points only when it shows or hides the navaids. */
  const inRange = createMemo(() => navaidsShownAt(settings.rangeNm));
  /** The items of `layers` that draw: those shown, and a navaid only within the range. */
  const drawnItems = (layers: readonly Layer[]) =>
    drawnItemsOf(topology().chart, layers, layerState, inRange);
  const points = createMemo(() => drawnPointsOf(topology(), drawnItems(POINT_LAYERS)));
  /** Each network's geodesics, kept until the chart or the projection changes. */
  const lines = createMemo(() => {
    const { areas, routes } = topology();
    projectionVersion();
    return { areas: pathLines(areas, projectNm), routes: pathLines(routes, projectNm) };
  });
  const uncut = createMemo(() => uncutSpans(lines().areas));
  const spans = createMemo((): SpansOf => {
    const cuts = stopCuts(points(), (layer) => LAYER_TABLE[layer].style.size);
    return pathSpans(cuts, lines().routes);
  });
  const places = createMemo(() => {
    topology();
    projectionVersion();
    return new Map<string, AreaPlace | undefined>();
  });
  return {
    drawnItemsIn: drawnItems,
    /** The points that draw. */
    drawnPoints: points,
    /** The spans of an area: no point stops them. */
    areaSpans: (path: ChartPath) => uncut()(path),
    /**
     * The spans of a route, stopping at the points that draw. Only a route that draws or is
     * pointed at reads them, so a build without one does not follow the points.
     */
    routeSpans: (path: ChartPath) => spans()(path),
    /**
     * Where each area item's label goes. A place is found the first time an item asks for it and
     * kept until the chart or the projection changes, never renewed by a zoom or a pan.
     */
    areaPlace: (item: ChartItem): AreaPlace | undefined => {
      const known = places();
      if (!known.has(item.key)) known.set(item.key, areaPlaceOf(item, projectNm));
      return known.get(item.key);
    },
  };
});
