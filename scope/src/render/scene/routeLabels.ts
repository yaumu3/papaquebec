import { nameOf } from '../../lib/chart';
import { rememberFits } from '../../lib/fits';
import type { ProjectFn } from '../../lib/geo';
import { geodesicLine } from '../../lib/geodesic';
import { DRAW_STACK, isAirwayLayer } from '../../lib/layers';
import { lengthOf, midpointOf, readingAngle } from '../../lib/polyline';
import { type Span, spanIdentity, spansOf } from '../../lib/stops';
import type { ChartPath } from '../../lib/topology';
import type { Batch } from '../protocol';
import type { FitInput, LabelsInput } from './chart';
import { LAYER_STYLES, type LabelStyle, labelReaches } from './layerStyles';
import { LineBatch, TextBatch } from './pack';
import { THEME } from './rules';
import { partsOf, routeCuts } from './runs';

/** CSS px between two designators of a label. */
const SEPARATOR_PX = 9;
/** The gap in the line: CSS px past the text each side, and across. */
const GAP_MARGIN_PX = 4;
const GAP_HEIGHT_PX = 12;

/** One name on a label, in its layer's label style. */
interface Designator {
  name: string;
  label: LabelStyle;
  /** Where its layer stands in the draw stack, front first. */
  rank: number;
}

/** A span with every designator that runs along it; its geometry is the first path's. */
interface Candidate {
  /** The span's identity. */
  id: string;
  path: ChartPath;
  span: Span;
  designators: Designator[];
}

/** The airway designators of the drawn parts, by the span they run along. */
function candidatesOf({
  topology,
  drawnItems,
  drawnPoints,
  labelDensity,
}: LabelsInput): Candidate[] {
  const drawn = partsOf(drawnItems);
  const cuts = routeCuts(drawnItems, drawnPoints);
  const byIdentity = new Map<string, Candidate>();
  for (const path of topology.routes.paths) {
    const label = LAYER_STYLES[path.layer].label;
    const name = nameOf(path.part);
    if (!isAirwayLayer(path.layer) || !drawn.has(path.part) || name === undefined) continue;
    if (!label || !labelReaches(label, labelDensity)) continue;
    const designator = { name, label, rank: DRAW_STACK.indexOf(path.layer) };
    for (const span of spansOf(path, cuts)) {
      const id = spanIdentity(path, span);
      const found = byIdentity.get(id) ?? { id, path, span, designators: [] };
      byIdentity.set(id, found);
      if (!found.designators.some((d) => d.name === name && d.rank === designator.rank)) {
        found.designators.push(designator);
      }
    }
  }
  return [...byIdentity.values()];
}

const byStack = (a: Designator, b: Designator) => a.rank - b.rank || a.name.localeCompare(b.name);

/** CSS px a label needs besides its text before it is shown: room for the line either side. */
const MARGIN_PX = 28;

/** Where a candidate's label goes, how it reads, and how it fits its span. */
function layoutOf({ path, span, designators }: Candidate, project: ProjectFn, text: TextBatch) {
  const line = geodesicLine(path.coordinates.slice(span.from, span.to + 1), project);
  const middle = midpointOf(line);
  if (!middle) return undefined;
  const ordered = designators.toSorted(byStack);
  const widths = ordered.map((d) => text.measure(d.name, d.label.size));
  const total = widths.reduce((sum, w) => sum + w, 0) + SEPARATOR_PX * (ordered.length - 1);
  return {
    middle,
    angle: readingAngle(middle.direction).angle,
    ordered,
    widths,
    total,
    length: lengthOf(line),
  };
}

type Layout = NonNullable<ReturnType<typeof layoutOf>>;

/** Puts the designators of a span along it, on a gap cut in the line. */
function putLabel(
  { middle, angle, ordered, widths, total }: Layout,
  out: { gaps: LineBatch; text: TextBatch },
) {
  let pen = -total / 2;
  ordered.forEach(({ name, label }, i) => {
    const at = { ...middle.at, px: pen, py: 0 };
    out.text.text(name, at, label.size, label.color, { baseline: 'middle', angle, halo: true });
    pen += (widths[i] ?? 0) + SEPARATOR_PX;
  });
  const half = total / 2 + GAP_MARGIN_PX;
  const end = (sign: number) => ({
    ...middle.at,
    px: sign * half * Math.cos(angle),
    py: sign * half * Math.sin(angle),
  });
  out.gaps.segment(end(-1), end(1), THEME.bg, { width: GAP_HEIGHT_PX });
}

/**
 * The labels of the airways: each span a drawn airway runs along gets one label, listing every
 * designator that runs along it, centred on the span's midpoint and set along it. A label that
 * does not fit its span at the settled scale is left out, once its width and 28 px are more
 * than the span's length on screen less the stop cuts. Returns the gaps cut in the lines, then
 * the text, back to front through the draw stack.
 */
export function buildRouteLabels(input: LabelsInput & FitInput): Batch[] {
  const out = { gaps: new LineBatch(), text: new TextBatch(input.atlas) };
  const scale = input.settledScale();
  for (const candidate of candidatesOf(input).toReversed()) {
    const layout = layoutOf(candidate, input.project, out.text);
    if (!layout) continue;
    const { span } = candidate;
    const room = layout.length * scale - span.cutBack - span.cutAhead;
    if (rememberFits(input.shown, candidate.id, room, layout.total + MARGIN_PX))
      putLabel(layout, out);
  }
  return [out.gaps.finish(), out.text.finish()];
}
