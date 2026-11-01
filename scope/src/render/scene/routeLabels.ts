import type { Batch } from '../protocol';
import type { FitInput, LabelsInput } from './chart';
import { LineBatch, TextBatch } from './pack';
import { THEME } from './rules';
import { routeCuts } from './runs';
import {
  CHEVRON_CLEAR_PX,
  CHEVRON_PX,
  CHEVRON_SLOT_PX,
  designatedSpans,
  type SpanLabel,
  SEPARATOR_PX,
  widthOf,
} from './spanDesignators';

/** The gap in the line: CSS px past the text each side, and across. */
const GAP_MARGIN_PX = 4;
const GAP_HEIGHT_PX = 12;
/** A chevron's V: CSS px deep along the reading, across, and its stroke. */
const CHEVRON_DEPTH_PX = 5;
const CHEVRON_ACROSS_PX = 7;
const CHEVRON_STROKE_PX = 1.3;

/** What a label draws: the gaps cut in the lines, its text, and the chevrons beside the text. */
interface Out {
  gaps: LineBatch;
  text: TextBatch;
  chevrons: LineBatch;
}

/** An offset along and across a label turned by its angle, as the offset of an anchor. */
const turned = (x: number, y: number, angle: number) => ({
  px: x * Math.cos(angle) - y * Math.sin(angle),
  py: x * Math.sin(angle) + y * Math.cos(angle),
});

/** A chevron from `slot` along the label: a V, pointing the way the route is flown. */
function putChevron(
  { middle, angle }: SpanLabel,
  slot: number,
  ahead: boolean,
  color: string,
  chevrons: LineBatch,
) {
  const [arms, tip] = ahead
    ? [
        slot + (CHEVRON_SLOT_PX - CHEVRON_DEPTH_PX) / 2,
        slot + (CHEVRON_SLOT_PX + CHEVRON_DEPTH_PX) / 2,
      ]
    : [
        slot + (CHEVRON_SLOT_PX + CHEVRON_DEPTH_PX) / 2,
        slot + (CHEVRON_SLOT_PX - CHEVRON_DEPTH_PX) / 2,
      ];
  const at = (x: number, y: number) => ({ ...middle.at, ...turned(x, y, angle) });
  for (const side of [-1, 1]) {
    const arm = at(arms, (side * CHEVRON_ACROSS_PX) / 2);
    chevrons.segment(arm, at(tip, 0), color, { width: CHEVRON_STROKE_PX });
  }
}

/** Puts the designators of a span along it, each with its chevron, on a gap cut in the line. */
function putLabel(spanLabel: SpanLabel, out: Out) {
  const { middle, angle, designators } = spanLabel;
  const total = widthOf(designators, out.text);
  let pen = -total / 2;
  for (const { name, label, oneWay, reads } of designators) {
    const width = out.text.measure(name, label.size);
    const before = oneWay && !reads;
    const textAt = before ? pen + CHEVRON_PX : pen;
    out.text.text(name, { ...middle.at, px: textAt, py: 0 }, label.size, label.color, {
      baseline: 'middle',
      angle,
      halo: true,
    });
    if (oneWay) {
      const slot = before ? pen : pen + width + CHEVRON_CLEAR_PX;
      putChevron(spanLabel, slot, reads, label.color, out.chevrons);
    }
    pen += width + (oneWay ? CHEVRON_PX : 0) + SEPARATOR_PX;
  }
  const half = total / 2 + GAP_MARGIN_PX;
  const end = (sign: number) => ({ ...middle.at, ...turned(sign * half, 0, angle) });
  out.gaps.segment(end(-1), end(1), THEME.bg, { width: GAP_HEIGHT_PX });
}

/**
 * The labels of the routes: each span a drawn airway runs along gets one label listing every
 * designator that runs along it, centred on the span's midpoint and set along it, and each
 * drawn procedure is named once, on the first span that has room for it. A label that does not
 * fit its span at the settled scale is left out: its width and 28 px must fit the span's length
 * on screen less the stop cuts. Returns the gaps cut in the lines, the text, then the chevrons
 * of the one-way routes, back to front through the draw stack.
 */
export function buildRouteLabels(input: LabelsInput & FitInput): Batch[] {
  const out = {
    gaps: new LineBatch(),
    text: new TextBatch(input.atlas),
    chevrons: new LineBatch(),
  };
  const stage = {
    ...input,
    cuts: routeCuts(input.drawnItems, input.drawnPoints),
    scale: input.settledScale(),
    text: out.text,
  };
  for (const spanLabel of designatedSpans(stage)) putLabel(spanLabel, out);
  return [out.gaps.finish(), out.text.finish(), out.chevrons.finish()];
}
