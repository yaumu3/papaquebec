import type { Batch, BatchKind } from './protocol';

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
