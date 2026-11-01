import type { AtlasInfo } from '../render/protocol';
import { buildLabels, buildShapes } from '../render/scene/chart';
import { CHART_SLICES, labelSlots, type Slots, shapeSlots } from '../render/slots';
import { drawnItemsIn, drawnPoints } from '../state/drawnPoints';
import { topology } from '../state/mapsets';
import { settings } from '../state/settings';
import { projectNm } from '../state/tracks';

/** Hands the renderer the slots a builder returns, again whenever what it reads changes. */
export type Show = (build: (atlas: AtlasInfo) => Slots | null) => void;

/**
 * Shows each slice of the chart: its shapes and its labels are built apart, so a change that
 * only the labels read does not rebuild the lines.
 */
export function showChart(show: Show, projected: () => boolean): void {
  for (const slice of CHART_SLICES) {
    show(() =>
      projected()
        ? shapeSlots(
            slice,
            buildShapes({
              topology: topology(),
              drawnPoints,
              project: projectNm,
              layers: slice.layers,
              drawnItems: drawnItemsIn(slice.layers),
            }),
          )
        : null,
    );
    show((atlas) =>
      projected()
        ? labelSlots(
            slice,
            buildLabels({
              drawnPoints,
              project: projectNm,
              layers: slice.layers,
              drawnItems: drawnItemsIn(slice.layers),
              labelDensity: settings.labelDensity,
              atlas,
            }),
          )
        : null,
    );
  }
}
