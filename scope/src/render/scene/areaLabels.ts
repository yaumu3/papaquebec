import { itemName } from '../../lib/chart';
import { rememberFits } from '../../lib/fits';
import type { Batch } from '../protocol';
import { blockOf, putBlock } from './areaBlocks';
import type { FitInput, LabelsInput, PlaceInput } from './chart';
import { LAYER_STYLES, labelReaches } from './layerStyles';
import { LineBatch, TextBatch } from './pack';

/**
 * The labels of the drawn area items, each block centred on its place, back to front through
 * the stack. A layer with no label style, or whose density the label density has not reached,
 * says nothing. A block needs half its width between the pole and the nearest edge, in px at
 * the settled scale; a line area has no edge to test and is always labelled. Returns the text,
 * then the rules of the fractions.
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
  const out = { text: new TextBatch(atlas), rules: new LineBatch() };
  const scale = settledScale();
  for (const layer of layers.toReversed()) {
    const label = LAYER_STYLES[layer].label;
    if (!label || !labelReaches(label, labelDensity)) continue;
    for (const item of drawnItems.filter((i) => i.layer === layer)) {
      const name = itemName(item);
      const place = placeOf(item);
      if (name === undefined || !place) continue;
      const block = blockOf(item, name, label, labelDensity, out.text);
      if (
        place.room !== undefined &&
        !rememberFits(shown, item.key, place.room * scale, block.width / 2)
      ) {
        continue;
      }
      putBlock(block, place.at, out);
    }
  }
  return [out.text.finish(), out.rules.finish()];
}
