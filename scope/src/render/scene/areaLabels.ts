import { itemName } from '../../lib/chart';
import { rememberFits } from '../../lib/fits';
import type { Batch } from '../protocol';
import type { FitInput, LabelsInput, PlaceInput } from './chart';
import { LAYER_STYLES, labelReaches } from './layerStyles';
import { TextBatch } from './pack';

/**
 * The names of the drawn area items, each centred on its place, back to front through the
 * stack. A layer with no label style, or whose density the label density has not reached, names
 * nothing. A name needs half its width between the pole and the nearest edge, in px at the
 * settled scale; a line area has no edge to test and is always named.
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
      const half = text.measure(name, label.size) / 2;
      if (place.room !== undefined && !rememberFits(shown, item.key, place.room * scale, half)) {
        continue;
      }
      text.text(name, place.at, label.size, label.color, {
        align: 'center',
        baseline: 'middle',
        halo: true,
      });
    }
  }
  return [text.finish()];
}
