import { createMemo, createRoot } from 'solid-js';

import { navaidsShownAt, visibleLayers } from '../lib/layers';
import { POINT_LAYERS } from '../lib/mapsetFormat';
import { drawnPointsOf } from '../lib/topology';
import { topology } from './mapsets';
import { settings } from './settings';

/**
 * The memos sit in a root of their own: they live as long as the page, like the state they
 * read, and `canvas/hit.ts` reads them outside the scene.
 */
export const { navaidsInRange, drawnPoints } = createRoot(() => {
  /** Zooming reaches the points only when it shows or hides the navaids. */
  const inRange = createMemo(() => navaidsShownAt(settings.rangeNm));
  return {
    navaidsInRange: inRange,
    /** The points that draw: their layer shown, and a navaid only within the range. */
    drawnPoints: createMemo(() =>
      drawnPointsOf(
        topology(),
        visibleLayers(POINT_LAYERS, (l) => settings.shownLayers[l], inRange),
      ),
    ),
  };
});
