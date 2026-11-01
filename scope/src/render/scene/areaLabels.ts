import { type ChartItem, itemFrequency, itemName } from '../../lib/chart';
import { rememberFits } from '../../lib/fits';
import type { Vec2 } from '../../lib/geo';
import { stratumTag } from '../../lib/stratum';
import type { LabelDensity } from '../../state/settingsDefaults';
import type { Batch } from '../protocol';
import type { FitInput, LabelsInput, PlaceInput } from './chart';
import { LAYER_STYLES, type LabelStyle, labelReaches } from './layerStyles';
import { TextBatch } from './pack';
import { THEME } from './rules';

/** A sector's details are in 9 px, set 6 px apart from the name and from each other. */
const DETAIL_SIZE_PX = 9;
const DETAIL_GAP_PX = 6;

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

/** What a sector adds to its name at DENSE: its first frequency and its stratum, as it has them. */
const detailsOf = (item: ChartItem): string[] =>
  [itemFrequency(item) ?? '', stratumTag(item.parts)].filter((detail) => detail !== '');

/** The block of an item: its name on one row, and a sector's details after it at DENSE. */
function blockOf(
  item: ChartItem,
  name: string,
  label: LabelStyle,
  density: LabelDensity,
  text: TextBatch,
): Block {
  const details = item.layer === 'sector' && density === 'dense' ? detailsOf(item) : [];
  const runs: Run[] = [{ text: name, size: label.size, color: label.color, x: 0 }];
  let width = text.measure(name, label.size);
  for (const detail of details) {
    runs.push({
      text: detail,
      size: DETAIL_SIZE_PX,
      color: THEME.sectorDetail,
      x: width + DETAIL_GAP_PX,
    });
    width += DETAIL_GAP_PX + text.measure(detail, DETAIL_SIZE_PX);
  }
  return { rows: [{ runs, width, y: 0 }], width };
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
      const block = blockOf(item, name, label, labelDensity, text);
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
