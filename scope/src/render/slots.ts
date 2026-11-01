import { DRAW_STACK, isStyled, type StyledLayer } from '../lib/layers';
import type { Batch } from './protocol';

/** The layers from `first` to `last` of the draw stack, front first. */
const stackSlice = (first: StyledLayer, last: StyledLayer) =>
  DRAW_STACK.slice(DRAW_STACK.indexOf(first), DRAW_STACK.indexOf(last) + 1).filter(isStyled);

/**
 * The chart is built in three slices of the draw stack, so a toggle rebuilds only the slices that
 * read its layer. Each fills a slot for its lines and markers and one for its labels. `hold` sits
 * in none: it draws nothing.
 */
export const CHART_SLICES = [
  { layers: stackSlice('ctr', 'asr'), shapes: 'areaLines', labels: 'areaLabels' },
  { layers: stackSlice('sid', 'dct'), shapes: 'routeLines', labels: 'routeLabels' },
  { layers: stackSlice('ad', 'vfr'), shapes: 'pointMarkers', labels: 'pointLabels' },
] as const;

/**
 * Every slot the scope draws, back to front: the base map, the lines of the chart, its labels,
 * its point markers, the traces of what the tree points at, then what moves. Markers sit over
 * the labels so that a label's halo or gap cuts the lines behind it but never a symbol.
 */
export const SLOT_ORDER = [
  'ringLines',
  'coastLines',
  'areaLines',
  'routeLines',
  'ringLabels',
  'areaLabels',
  'routeLabels',
  'pointLabels',
  'pointMarkers',
  'traces',
  'targets',
  'hover',
  'overlays',
] as const;

export type SlotName = (typeof SLOT_ORDER)[number];

/**
 * The slots of the map's labels, in draw order. The renderer rims all their glyphs with halos
 * before it draws any glyph, so no halo covers the ink of a label of another slot.
 */
export const LABEL_SLOTS: readonly SlotName[] = [
  'ringLabels',
  'areaLabels',
  'routeLabels',
  'pointLabels',
];

/** The batches a builder hands the renderer, by the slots it fills. */
export type Slots = Partial<Record<SlotName, Batch[]>>;

/** What a slice builds of its shapes: its lines and its markers. */
export interface ShapeBatches {
  lines: Batch;
  markers: Batch;
}

/** A slice's built shapes as the slots they go to. */
export function shapeSlots(
  slice: (typeof CHART_SLICES)[number],
  { lines, markers }: ShapeBatches,
): Slots {
  return { [slice.shapes]: [lines, markers] };
}

/** A slice's built labels as the slot they go to. */
export function labelSlots(slice: (typeof CHART_SLICES)[number], labels: Batch[]): Slots {
  return { [slice.labels]: labels };
}
