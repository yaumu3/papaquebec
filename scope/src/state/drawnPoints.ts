import { createMemo, createRoot } from 'solid-js';

import { type Layer, POINT_LAYERS } from '../lib/mapsetFormat';
import { drawnPointsOf } from '../lib/topology';
import { drawnItemsOf, navaidsShownAt } from '../lib/visibility';
import { layerState } from './layerVisibility';
import { topology } from './mapsets';
import { settings } from './settings';

/**
 * What draws sits in a root of its own: it lives as long as the page, like the state it
 * reads, and `canvas/hit.ts` reads it outside the scene.
 */
export const { drawnItemsIn, drawnPoints } = createRoot(() => {
  /** Zooming reaches the points only when it shows or hides the navaids. */
  const inRange = createMemo(() => navaidsShownAt(settings.rangeNm));
  /** The items of `layers` that draw: those shown, and a navaid only within the range. */
  const drawnItems = (layers: readonly Layer[]) =>
    drawnItemsOf(topology().chart, layers, layerState, inRange);
  return {
    drawnItemsIn: drawnItems,
    /** The points that draw. */
    drawnPoints: createMemo(() => drawnPointsOf(topology(), drawnItems(POINT_LAYERS))),
  };
});
