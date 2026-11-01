import { createMemo } from 'solid-js';

import type { ChartItem } from '../lib/chart';
import type { ShownMemory } from '../lib/fits';
import type { AtlasInfo, Batch } from '../render/protocol';
import { buildShapes, buildSliceLabels } from '../render/scene/chart';
import type { BuiltLabels } from '../render/scene/drawnLabels';
import { buildHighlight } from '../render/scene/highlight';
import { CHART_SLICES, labelSlots, type Slots, shapeSlots } from '../render/slots';
import { areaPlace } from '../state/areaPlaces';
import { drawnItemsIn, drawnPoints } from '../state/drawnPoints';
import { declinationAt } from '../state/magnetic';
import { topology } from '../state/mapsets';
import { settings } from '../state/settings';
import { projectNm } from '../state/tracks';

/** Hands the renderer the slots a builder returns, again whenever what it reads changes. */
export type Show = (build: (atlas: AtlasInfo) => Slots | null) => void;

/**
 * Shows each slice of the chart: its shapes and its labels are built apart, so a change that
 * only the labels read does not rebuild the lines. The route and area labels also follow the
 * settled scale, so a zoom that settles builds them again to test whether they still fit, and
 * they remember what they showed between builds. Each slice's labels are built once, in a memo
 * that also keeps what they drew; the returned reader gives the batches that light an item's label,
 * so a hover reads cached state and never builds the labels.
 */
export function showChart(
  show: Show,
  projected: () => boolean,
  settledScale: () => number,
  atlas: () => AtlasInfo | null,
): (item: ChartItem) => Batch[] {
  const labels = new Map<(typeof CHART_SLICES)[number], () => BuiltLabels | null>();
  for (const slice of CHART_SLICES) {
    const shown: ShownMemory = new Map();
    show(() =>
      projected()
        ? shapeSlots(
            slice,
            buildShapes(
              {
                topology: topology(),
                drawnPoints,
                project: projectNm,
                layers: slice.layers,
                drawnItems: drawnItemsIn(slice.layers),
              },
              declinationAt,
            ),
          )
        : null,
    );
    const built = createMemo(() => {
      const a = atlas();
      return a && projected()
        ? buildSliceLabels(slice, {
            topology: topology(),
            drawnPoints,
            project: projectNm,
            layers: slice.layers,
            drawnItems: drawnItemsIn(slice.layers),
            labelDensity: settings.labelDensity,
            atlas: a,
            settledScale,
            placeOf: areaPlace,
            shown,
          })
        : null;
    });
    labels.set(slice, built);
    show(() => {
      const made = built();
      return made ? labelSlots(slice, made.batches) : null;
    });
  }
  const routeSlice = CHART_SLICES.find((slice) => slice.labels === 'routeLabels');
  const routeSpanLabels = () => (routeSlice && labels.get(routeSlice)?.()?.spanLabels) || new Map();
  return (item) => {
    const info = atlas();
    if (!info) return [];
    const slice = CHART_SLICES.find(({ layers }) => layers.some((l) => l === item.layer));
    const drawn = slice && labels.get(slice)?.()?.drawn?.get(item.key);
    return buildHighlight(item, drawn, {
      spanLabels: routeSpanLabels(),
      topology: topology(),
      drawnPoints,
      project: projectNm,
      atlas: info,
      placeOf: areaPlace,
    });
  };
}
