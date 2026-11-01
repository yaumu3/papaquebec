import { itemName } from '../../lib/chart';
import { rememberFits } from '../../lib/fits';
import type { Vec2 } from '../../lib/geo';
import type { Batch } from '../protocol';
import type { FitInput, LabelsInput, PlaceInput } from './chart';
import { LAYER_STYLES, type LabelStyle, labelReaches } from './layerStyles';
import { TextBatch } from './pack';

/** A piece of text on a row of a block, `x` CSS px from the row's start. */
interface Run {
  text: string;
  size: number;
  color: string;
  x: number;
}

/** A row of runs, centred on the block, `y` CSS px below the block's centre. */
interface Row {
  runs: Run[];
  width: number;
  y: number;
}

/** What an area's label says, as rows of runs, and how wide it is. */
interface Block {
  rows: Row[];
  width: number;
}

/** The block of an item: its name on one row. */
function blockOf(name: string, label: LabelStyle, text: TextBatch): Block {
  const width = text.measure(name, label.size);
  return {
    rows: [{ runs: [{ text: name, size: label.size, color: label.color, x: 0 }], width, y: 0 }],
    width,
  };
}

/** Puts a block's rows centred on `at`. */
function putBlock({ rows }: Block, at: Vec2, text: TextBatch) {
  for (const row of rows) {
    for (const run of row.runs) {
      const anchor = { ...at, px: run.x - row.width / 2, py: row.y };
      text.text(run.text, anchor, run.size, run.color, { baseline: 'middle', halo: true });
    }
  }
}

/**
 * The labels of the drawn area items, each block centred on its place, back to front through
 * the stack. A layer with no label style, or whose density the label density has not reached,
 * says nothing. A block needs half its width between the pole and the nearest edge, in px at
 * the settled scale; a line area has no edge to test and is always labelled.
 */
export function buildAreaLabels({
  drawnItems,
  layers,
  labelDensity,
  atlas,
  placeOf,
  settledScale,
  shown,
}: LabelsInput & PlaceInput & FitInput): Batch[] {
  const text = new TextBatch(atlas);
  const scale = settledScale();
  for (const layer of layers.toReversed()) {
    const label = LAYER_STYLES[layer].label;
    if (!label || !labelReaches(label, labelDensity)) continue;
    for (const item of drawnItems.filter((i) => i.layer === layer)) {
      const name = itemName(item);
      const place = placeOf(item);
      if (name === undefined || !place) continue;
      const block = blockOf(name, label, text);
      if (
        place.room !== undefined &&
        !rememberFits(shown, item.key, place.room * scale, block.width / 2)
      ) {
        continue;
      }
      putBlock(block, place.at, text);
    }
  }
  return [text.finish()];
}
