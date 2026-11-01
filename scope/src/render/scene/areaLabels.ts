import { itemName } from '../../lib/chart';
import type { Batch } from '../protocol';
import type { LabelsInput, PlaceInput } from './chart';
import { LAYER_STYLES, labelReaches } from './layerStyles';
import { TextBatch } from './pack';

/**
 * The names of the drawn area items, each centred on its place, back to front through the
 * stack. A layer with no label style, or whose density the label density has not reached, names
 * nothing.
 */
export function buildAreaLabels({
  drawnItems,
  layers,
  labelDensity,
  atlas,
  placeOf,
}: LabelsInput & PlaceInput): Batch[] {
  const text = new TextBatch(atlas);
  for (const layer of layers.toReversed()) {
    const label = LAYER_STYLES[layer].label;
    if (!label || !labelReaches(label, labelDensity)) continue;
    for (const item of drawnItems.filter((i) => i.layer === layer)) {
      const name = itemName(item);
      const place = placeOf(item);
      if (name === undefined || !place) continue;
      text.text(name, place.at, label.size, label.color, {
        align: 'center',
        baseline: 'middle',
        halo: true,
      });
    }
  }
  return [text.finish()];
}
