import type { Batch } from '../protocol';
import type { FitInput, LabelsInput } from './chart';
import { LineBatch, TextBatch } from './pack';
import { THEME } from './rules';
import { routeCuts } from './runs';
import { designatedSpans, type Entry, SEPARATOR_PX, widthOf } from './spanDesignators';

/** The gap in the line: CSS px past the text each side, and across. */
const GAP_MARGIN_PX = 4;
const GAP_HEIGHT_PX = 12;

/** Puts the designators of a span along it, on a gap cut in the line. */
function putLabel(
  { geometry: { middle, angle }, designators }: Entry,
  out: { gaps: LineBatch; text: TextBatch },
) {
  const total = widthOf(designators, out.text);
  let pen = -total / 2;
  for (const { name, label } of designators) {
    const at = { ...middle.at, px: pen, py: 0 };
    out.text.text(name, at, label.size, label.color, { baseline: 'middle', angle, halo: true });
    pen += out.text.measure(name, label.size) + SEPARATOR_PX;
  }
  const half = total / 2 + GAP_MARGIN_PX;
  const end = (sign: number) => ({
    ...middle.at,
    px: sign * half * Math.cos(angle),
    py: sign * half * Math.sin(angle),
  });
  out.gaps.segment(end(-1), end(1), THEME.bg, { width: GAP_HEIGHT_PX });
}

/**
 * The labels of the routes: each span a drawn airway runs along gets one label listing every
 * designator that runs along it, centred on the span's midpoint and set along it, and each
 * drawn procedure is named once, on the first span that has room for it. A label that does not
 * fit its span at the settled scale is left out: its width and 28 px must fit the span's length
 * on screen less the stop cuts. Returns the gaps cut in the lines, then the text, back to front
 * through the draw stack.
 */
export function buildRouteLabels(input: LabelsInput & FitInput): Batch[] {
  const out = { gaps: new LineBatch(), text: new TextBatch(input.atlas) };
  const stage = {
    ...input,
    cuts: routeCuts(input.drawnItems, input.drawnPoints),
    scale: input.settledScale(),
    text: out.text,
  };
  for (const entry of designatedSpans(stage)) putLabel(entry, out);
  return [out.gaps.finish(), out.text.finish()];
}
