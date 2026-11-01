import { createMemo } from 'solid-js';

import type { ChartItem } from '../lib/chart';
import type { ShownMemory } from '../lib/fits';
import type { AtlasInfo, Batch } from '../render/protocol';
import { type BuiltLabels, buildShapes, CHART_SLICES, sliceOf } from '../render/scene/chart';
import { buildHighlight } from '../render/scene/highlight';
import type { Slots } from '../render/slots';
import { areaPlace, drawnItemsIn, drawnPoints, routeSpans } from '../state/drawn';
import { declinationAt } from '../state/magnetic';
import { topology } from '../state/mapsets';
import { settings } from '../state/settings';
import { projectNm } from '../state/tracks';

/** Hands the renderer the slots a builder returns, again whenever what it reads changes. */
export type Show = (build: (atlas: AtlasInfo) => Slots | null) => void;

/** What a slice's shapes and labels both read. */
const inputOf = (layers: Parameters<typeof drawnItemsIn>[0]) => ({
  topology: topology(),
  drawnPoints,
  project: projectNm,
  routeSpans,
  layers,
  drawnItems: drawnItemsIn(layers),
});

/**
 * Shows each slice of the chart: its shapes and its labels are built apart, so a change that
 * only the labels read does not rebuild the lines. The route and area labels also follow the
 * settled scale, so a zoom that settles builds them again to test whether they still fit, and
 * they remember what they showed between builds. Each slice's labels are built once, in a memo;
 * the returned reader gives the batches that light an item's label, so a hover reads cached
 * state and never builds the labels.
 */
export function showChart(
  show: Show,
  projected: () => boolean,
  settledScale: () => number,
  atlas: () => AtlasInfo | null,
): (item: ChartItem) => Batch[] {
  const labels = new Map(
    CHART_SLICES.map((slice): [typeof slice, () => BuiltLabels | null] => {
      const shown: ShownMemory = new Map();
      show(() => (projected() ? buildShapes(slice, inputOf(slice.layers), declinationAt) : null));
      const built = createMemo(() => {
        const a = atlas();
        return a && projected()
          ? slice.buildLabels({
              ...inputOf(slice.layers),
              labelDensity: settings.labelDensity,
              atlas: a,
              settledScale,
              placeOf: areaPlace,
              shown,
            })
          : null;
      });
      show(() => {
        const made = built();
        return made ? { [slice.labels]: made.batches } : null;
      });
      return [slice, built];
    }),
  );
  const labelsOf = (item: ChartItem) => labels.get(sliceOf(item.layer))?.();
  return (item) => {
    const info = atlas();
    if (!info) return [];
    return buildHighlight(item, {
      spanLabels: labels.get(sliceOf('conv'))?.()?.spanLabels ?? new Map(),
      areaNames: labelsOf(item)?.areaNames ?? new Map(),
      topology: topology(),
      project: projectNm,
      routeSpans,
      atlas: info,
      placeOf: areaPlace,
    });
  };
}
