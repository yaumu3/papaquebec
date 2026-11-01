import { type ChartItem, itemName } from '../../lib/chart';
import { rememberFits } from '../../lib/fits';
import { stacksOf } from '../../lib/labelStacks';
import { labelReaches, LAYER_TABLE } from '../../lib/layers';
import { isChartLayer } from '../../lib/mapsetFormat';
import type { AreaPlace } from '../../lib/pole';
import { limitFt, bandOf } from '../../lib/stratum';
import { blockOf, putBlock, putBlockAtName, stackedBlock } from './areaBlocks';
import type { FitInput, LabelsInput, PlaceInput } from './chart';
import type { BuiltLabels, DrawnLabel, LabelOut } from './drawnLabels';
import { LineBatch, TextBatch } from './pack';

/** A named item and where its label goes. */
interface Member {
  item: ChartItem;
  name: string;
  place: AreaPlace;
}

/** The labelled members of a layer's items: those with a name and a place. */
function membersOf(items: readonly ChartItem[], placeOf: PlaceInput['placeOf']): Member[] {
  return items.flatMap((item) => {
    const name = itemName(item);
    const place = placeOf(item);
    return name !== undefined && place ? [{ item, name, place }] : [];
  });
}

/** The members that share a footprint, the lowest stratum first; a member alone is a stack of one. */
const stacksOfMembers = (members: Member[]): Member[][] =>
  stacksOf(
    members,
    (m) => m.place.footprint,
    (m) => limitFt(bandOf(m.item.parts).lower),
    (m) => m.name,
  );

/**
 * Puts an area item's block as DENSE lays it out, with no room test and no density gate: on the
 * name the chart drew, where it drew one, else centred on the item's place. Says nothing without
 * a label style, a name or a place.
 */
export function putAreaLabel(
  item: ChartItem,
  drawn: DrawnLabel | undefined,
  placeOf: PlaceInput['placeOf'],
  out: LabelOut,
) {
  const label = isChartLayer(item.layer) ? LAYER_TABLE[item.layer].style.label : undefined;
  const name = itemName(item);
  const place = placeOf(item);
  if (!label || name === undefined || !place) return;
  const block = blockOf(item, name, label, 'dense', out.text);
  const drawnName = drawn?.texts[0]?.at;
  if (drawnName) putBlockAtName(block, drawnName, out);
  else putBlock(block, place.at, out);
}

/**
 * The labels of the drawn area items, each block centred on its place, back to front through
 * the stack; items of one footprint stack, the lowest stratum on top, and are shown or hidden
 * as one. A layer with no label style, or whose density the label density has not reached,
 * says nothing. A block needs half its width between the pole and the nearest edge, in px at
 * the settled scale; a line area has no edge to test and is always labelled. Returns the text,
 * then the rules of the fractions, and what each item's label drew.
 */
export function buildAreaLabels({
  drawnItems,
  layers,
  labelDensity,
  atlas,
  placeOf,
  settledScale,
  shown,
}: LabelsInput & PlaceInput & FitInput): BuiltLabels {
  const out = { text: new TextBatch(atlas), strokes: new LineBatch(), drawn: new Map() };
  const scale = settledScale();
  for (const layer of layers.toReversed()) {
    const label = LAYER_TABLE[layer].style.label;
    if (!label || !labelReaches(label, labelDensity)) continue;
    const items = drawnItems.filter((i) => i.layer === layer);
    for (const stack of stacksOfMembers(membersOf(items, placeOf))) {
      const [first] = stack;
      if (!first) continue;
      const blocks = stack.map((m) => blockOf(m.item, m.name, label, labelDensity, out.text));
      const block = stackedBlock(blocks);
      const key = stack
        .map((m) => m.item.key)
        .toSorted()
        .join('\n');
      const { room } = first.place;
      if (room !== undefined && !rememberFits(shown, key, room * scale, block.width / 2)) continue;
      putBlock(block, first.place.at, out);
    }
  }
  return { batches: [out.text.finish(), out.strokes.finish()], drawn: out.drawn };
}
