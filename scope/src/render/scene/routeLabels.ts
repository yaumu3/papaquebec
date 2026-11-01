import type { FitInput, LabelsInput } from './chart';
import {
  type BuiltLabels,
  type DrawnStroke,
  keepGap,
  type LabelOut,
  putStroke,
  putText,
} from './drawnLabels';
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
export interface RouteLabelOut extends LabelOut {
  gaps: LineBatch;
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
  key: string,
  out: RouteLabelOut,
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
    putStroke(out, key, { from: arm, to: at(tip, 0), color, width: CHEVRON_STROKE_PX });
  }
}

/** The gap from `from` to `to` CSS px along a label from its middle, with a margin each side. */
function gapOf({ middle, angle }: SpanLabel, from: number, to: number): DrawnStroke {
  const end = (x: number) => ({ ...middle.at, ...turned(x, 0, angle) });
  return {
    from: end(from - GAP_MARGIN_PX),
    to: end(to + GAP_MARGIN_PX),
    color: THEME.bg,
    width: GAP_HEIGHT_PX,
  };
}

/**
 * Puts the designators of a span along it, each with its chevron, on a gap cut in the line; each
 * designator keeps the gap its own text and chevron take.
 */
export function putLabel(spanLabel: SpanLabel, out: RouteLabelOut) {
  const { middle, angle, designators } = spanLabel;
  const total = widthOf(designators, out.text);
  const style = { baseline: 'middle', angle, halo: true } as const;
  let pen = -total / 2;
  for (const { key, name, label, oneWay, reads } of designators) {
    const width = out.text.measure(name, label.size);
    const before = oneWay && !reads;
    const textAt = before ? pen + CHEVRON_PX : pen;
    const at = { ...middle.at, px: textAt, py: 0 };
    putText(out, key, { text: name, at, size: label.size, color: label.color, style });
    if (oneWay) {
      const slot = before ? pen : pen + width + CHEVRON_CLEAR_PX;
      putChevron(spanLabel, slot, reads, label.color, key, out);
    }
    const taken = width + (oneWay ? CHEVRON_PX : 0);
    keepGap(out.drawn, key, spanLabel.id, gapOf(spanLabel, pen, pen + taken));
    pen += taken + SEPARATOR_PX;
  }
  const { from, to, color, width } = gapOf(spanLabel, -total / 2, total / 2);
  out.gaps.segment(from, to, color, { width });
}

/**
 * The labels of the routes: each span a drawn airway runs along gets one label listing every
 * designator that runs along it, centred on the span's midpoint and set along it, and each
 * drawn procedure is named once, on the first span that has room for it. A label that does not
 * fit its span at the settled scale is left out: its width and 28 px must fit the span's length
 * on screen less the stop cuts. Returns the gaps cut in the lines, the text, then the chevrons
 * of the one-way routes, back to front through the draw stack, and what each item's label drew.
 */
export function buildRouteLabels(input: LabelsInput & FitInput): BuiltLabels {
  const out: RouteLabelOut = {
    gaps: new LineBatch(),
    text: new TextBatch(input.atlas),
    strokes: new LineBatch(),
    drawn: new Map(),
  };
  const stage = {
    ...input,
    cuts: routeCuts(input.drawnItems, input.drawnPoints),
    scale: input.settledScale(),
    text: out.text,
  };
  for (const spanLabel of designatedSpans(stage)) putLabel(spanLabel, out);
  return {
    batches: [out.gaps.finish(), out.text.finish(), out.strokes.finish()],
    drawn: out.drawn,
  };
}
