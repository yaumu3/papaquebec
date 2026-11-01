import { DRAW_STACK, isStyled, type StyledLayer } from '../lib/layers';
import type { Batch, BatchKind } from './protocol';

/** The layers from `first` to `last` of the draw stack, front first. */
const stackSlice = (first: StyledLayer, last: StyledLayer) =>
  DRAW_STACK.slice(DRAW_STACK.indexOf(first), DRAW_STACK.indexOf(last) + 1).filter(isStyled);

/**
 * The chart is built in three slices of the draw stack, so a toggle rebuilds only the slices that
 * read its layer. Each fills a slot for its lines and markers and one for its labels.
 */
export const CHART_SLICES = [
  { layers: stackSlice('ctr', 'asr'), shapes: 'areaLines', labels: 'areaLabels' },
  { layers: stackSlice('sid', 'hold'), shapes: 'routeLines', labels: 'routeLabels' },
  { layers: stackSlice('ad', 'vfr'), shapes: 'pointMarkers', labels: 'pointLabels' },
] as const;

/**
 * Every slot the scope draws, back to front: the base map, the lines of the chart, its route and
 * area labels, the traces of what the tree points at, the point labels and markers, the traced
 * points, then what moves. A gap or halo cuts the lines behind it but never a symbol: the traces
 * hold the lit route and area labels with their gaps, so they come before the points, and the
 * traced points, a lit point's symbol and ident, come over the chart's own.
 */
export const SLOT_ORDER = [
  'ringLines',
  'coastLines',
  'areaLines',
  'routeLines',
  'ringLabels',
  'areaLabels',
  'routeLabels',
  'traces',
  'pointLabels',
  'pointMarkers',
  'tracedPoints',
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

/**
 * The slots whose text rims its own glyphs just before them, over what the slot drew first: a
 * pointed label's highlight over its trace.
 */
const HIGHLIGHT_SLOTS: ReadonlySet<SlotName> = new Set(['traces', 'tracedPoints']);

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

/** A pipeline: one per batch kind, and the halo pass of text. */
export type Pass = BatchKind | 'halo';

/** One draw call: the pass over the `index`th batch of a slot. */
interface DrawStep {
  slot: SlotName;
  index: number;
  pass: Pass;
}

/**
 * The draw calls in order: the slots back to front, except that the halos of every text batch
 * of the label slots come first, where the first of them would draw, and their glyphs follow in
 * slot order. The text of the highlight slots rims itself just before its glyphs; text elsewhere
 * draws no halo.
 */
export function drawSteps(
  slots: ReadonlyMap<SlotName, readonly { kind: BatchKind }[]>,
): DrawStep[] {
  const batchesOf = (slot: SlotName) => slots.get(slot) ?? [];
  const steps: DrawStep[] = [];
  for (const slot of SLOT_ORDER) {
    if (slot === LABEL_SLOTS[0]) {
      for (const labels of LABEL_SLOTS) {
        batchesOf(labels).forEach(({ kind }, index) => {
          if (kind === 'text') steps.push({ slot: labels, index, pass: 'halo' });
        });
      }
    }
    batchesOf(slot).forEach(({ kind }, index) => {
      if (kind === 'text' && HIGHLIGHT_SLOTS.has(slot)) steps.push({ slot, index, pass: 'halo' });
      steps.push({ slot, index, pass: kind });
    });
  }
  return steps;
}
