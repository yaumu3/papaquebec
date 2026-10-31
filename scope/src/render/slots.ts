import { DRAW_STACK, isStyled, type StyledLayer } from '../lib/layers';
import type { Batch } from './protocol';

/** The layers from `first` to `last` of the draw stack, front first. */
const stackSlice = (first: StyledLayer, last: StyledLayer) =>
  DRAW_STACK.slice(DRAW_STACK.indexOf(first), DRAW_STACK.indexOf(last) + 1).filter(isStyled);

/**
 * The chart is built in three runs of the draw stack, so a toggle rebuilds one run. Each fills a
 * slot for its lines and markers and one for its labels. `hold` sits in none: it draws nothing.
 */
export const CHART_SLICES = [
  { layers: stackSlice('ctr', 'asr'), shapes: 'areaLines', labels: 'areaLabels' },
  { layers: stackSlice('sid', 'dct'), shapes: 'routeLines', labels: 'routeLabels' },
  { layers: stackSlice('ad', 'vfr'), shapes: 'pointMarkers', labels: 'pointLabels' },
] as const;

/**
 * Every slot the scope draws, back to front: the base map, the lines and markers of the chart
 * with all its labels over them, then what moves.
 */
export const SLOT_ORDER = [
  'ringLines',
  'coastLines',
  'areaLines',
  'routeLines',
  'pointMarkers',
  'ringLabels',
  'areaLabels',
  'routeLabels',
  'pointLabels',
  'targets',
  'hover',
  'overlays',
] as const;

export type SlotName = (typeof SLOT_ORDER)[number];
/** The batches a builder hands the renderer, by the slots it fills. */
export type Slots = Partial<Record<SlotName, Batch[]>>;

/** What a slice builds: its lines, its markers and its labels. */
export interface SliceBatches {
  lines: Batch;
  markers: Batch;
  labels: Batch;
}

/** A slice's built batches as the slots they go to. */
export function sliceSlots(
  slice: (typeof CHART_SLICES)[number],
  { lines, markers, labels }: SliceBatches,
): Slots {
  return { [slice.shapes]: [lines, markers], [slice.labels]: [labels] };
}
