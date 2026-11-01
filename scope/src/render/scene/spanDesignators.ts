/** The labels of the routes: which designators label which span, and how each label draws. */

import { PALETTE } from '../../design/palette';
import { type ChartItem, itemName, nameOf } from '../../lib/chart';
import { fits, rememberFits, type ShownMemory } from '../../lib/fits';
import {
  isAirwayLayer,
  isProcedureLayer,
  type LabelStyle,
  labelReaches,
  LAYER_TABLE,
} from '../../lib/layers';
import type { RouteSpan } from '../../lib/routeSpans';
import type { ChartPath } from '../../lib/topology';
import type { BuiltLabels, FitInput, LabelsInput } from './chart';
import { LineBatch, TextBatch } from './pack';

/** CSS px between two designators of a label. */
const SEPARATOR_PX = 9;
/** CSS px a chevron takes along a label, and the clear space between it and its name. */
const CHEVRON_SLOT_PX = 7;
const CHEVRON_CLEAR_PX = 3;
/** CSS px a one-way designator takes beside its name. */
const CHEVRON_PX = CHEVRON_SLOT_PX + CHEVRON_CLEAR_PX;
/** CSS px a label needs besides its text before it is shown: room for the line either side. */
const MARGIN_PX = 28;

/** One name on a label, in its layer's label style. */
interface Designator {
  /** The key of its item. */
  key: string;
  name: string;
  label: LabelStyle;
  /** Where its layer stands in the draw stack, front first. */
  rank: number;
  /** Its route is flown one way only. */
  oneWay: boolean;
}

/** A designator on a span: whether its route is flown along the label's reading direction. */
interface Placed extends Designator {
  reads: boolean;
}

/** A span of some length, the designators along it, and whether it draws its label. */
export interface SpanLabel extends RouteSpan {
  middle: NonNullable<RouteSpan['middle']>;
  designators: Placed[];
  /** The span draws its label: its airways fit, or a procedure joined it. */
  shown: boolean;
}

type SpanLabels = Map<string, SpanLabel>;

/** What the stages read: the build's input and the text to measure. */
interface Stage extends LabelsInput {
  shown: ShownMemory;
  scale: number;
  text: TextBatch;
}

/** Draw-stack order, then by name. */
const byStack = (a: { rank: number; name: string }, b: { rank: number; name: string }) =>
  a.rank - b.rank || a.name.localeCompare(b.name);

/** The designator of a path's part, of the item `key`, in its layer's label style, if it has one. */
function designatorOf(path: ChartPath, key: string) {
  const label = LAYER_TABLE[path.layer].style.label;
  const name = nameOf(path.part);
  if (!label || name === undefined) return undefined;
  const { properties } = path.part;
  const oneWay = 'oneWay' in properties && properties.oneWay === true;
  return { key, name, label, rank: LAYER_TABLE[path.layer].rank, oneWay };
}

/** The designator of a path's part, if the density reaches its layer's label. */
function reachedDesignatorOf(path: ChartPath, key: string, density: LabelsInput['labelDensity']) {
  const designator = designatorOf(path, key);
  return designator && labelReaches(designator.label, density) ? designator : undefined;
}

/** A designator on a span's label: `reads` when its route is flown the way the label reads. */
function placedOn(designator: Designator, span: RouteSpan, spanLabel: SpanLabel): Placed {
  return { ...designator, reads: (span.start === spanLabel.start) !== spanLabel.middle.flipped };
}

/** The label of a span, found or made; none for a span with no length. */
function spanLabelOf(spanLabels: SpanLabels, span: RouteSpan) {
  const known = spanLabels.get(span.id);
  if (known) return known;
  const { middle } = span;
  if (!middle) return undefined;
  const made: SpanLabel = { ...span, middle, designators: [], shown: false };
  spanLabels.set(span.id, made);
  return made;
}

/** The text a label of these designators takes, in CSS px. */
function widthOf(designators: readonly Designator[], text: TextBatch): number {
  const names = designators.reduce(
    (sum, d) => sum + text.measure(d.name, d.label.size) + (d.oneWay ? CHEVRON_PX : 0),
    0,
  );
  return names + SEPARATOR_PX * Math.max(0, designators.length - 1);
}

/** What the span has to spare on the screen at the settled scale, less the cuts at its stops. */
const roomOf = ({ length, cutBack, cutAhead }: SpanLabel, scale: number) =>
  length * scale - cutBack - cutAhead;

/** The airway designators of the drawn parts, by the span they run along. */
function airwayLabels(stage: Stage): SpanLabels {
  const { topology, drawnItems, routeSpans, labelDensity } = stage;
  const keys = new Map(drawnItems.flatMap((item) => item.parts.map((part) => [part, item.key])));
  const spanLabels: SpanLabels = new Map();
  for (const path of topology.routes.paths) {
    const key = keys.get(path.part);
    const designator =
      key !== undefined &&
      isAirwayLayer(path.layer) &&
      reachedDesignatorOf(path, key, labelDensity);
    if (!designator) continue;
    for (const span of routeSpans(path)) {
      const spanLabel = spanLabelOf(spanLabels, span);
      const present = spanLabel?.designators.some(
        (d) => d.name === designator.name && d.rank === designator.rank,
      );
      if (spanLabel && !present) spanLabel.designators.push(placedOn(designator, span, spanLabel));
    }
  }
  return spanLabels;
}

/** What walking an item's spans reads. */
type ItemReading = Pick<Stage, 'topology' | 'routeSpans'>;

/** Tests each airway label for room at the settled scale, remembering the outcome per span. */
function settleAirways(spanLabels: SpanLabels, stage: Stage) {
  for (const spanLabel of spanLabels.values()) {
    const threshold = widthOf(spanLabel.designators, stage.text) + MARGIN_PX;
    spanLabel.shown = rememberFits(
      stage.shown,
      spanLabel.id,
      roomOf(spanLabel, stage.scale),
      threshold,
    );
  }
}

/** The drawn procedure items, in draw-stack order and then by name. */
function procedureItems(items: readonly ChartItem[]): ChartItem[] {
  return items
    .filter((item) => isProcedureLayer(item.layer))
    .map((item) => ({ item, rank: LAYER_TABLE[item.layer].rank, name: itemName(item) ?? '' }))
    .toSorted(byStack)
    .map(({ item }) => item);
}

/** The spans of an item, taking its parts in order and the spans of each in path order. */
function* spansOfItem(item: ChartItem, { topology, routeSpans }: ItemReading) {
  for (const part of item.parts) {
    for (const path of topology.routes.paths.filter((p) => p.part === part)) {
      for (const span of routeSpans(path)) yield { path, span };
    }
  }
}

/**
 * Names a procedure on the first span where the label with its designator added, every airway
 * along the span included, passes the room test with the span's remembered state; the whole
 * label is then drawn. A span it fails keeps whether it draws its label.
 */
function nameProcedure(item: ChartItem, spanLabels: SpanLabels, stage: Stage) {
  const { labelDensity, shown, scale, text } = stage;
  for (const { path, span } of spansOfItem(item, stage)) {
    const designator = reachedDesignatorOf(path, item.key, labelDensity);
    const spanLabel = designator && spanLabelOf(spanLabels, span);
    if (!spanLabel) continue;
    const named = [...spanLabel.designators, placedOn(designator, span, spanLabel)];
    if (fits(roomOf(spanLabel, scale), widthOf(named, text) + MARGIN_PX, shown.get(spanLabel.id))) {
      spanLabel.designators = named;
      spanLabel.shown = true;
      shown.set(spanLabel.id, true);
      return;
    }
    shown.set(spanLabel.id, spanLabel.shown);
  }
}

/**
 * The label of each span of an item with its designator on it: the chart's label of the span
 * where it has one, with the designator joined in draw-stack order, else the designator alone.
 * No room test and no density gate. The chart's labels are copied, not changed.
 */
export function itemLabels(
  item: ChartItem,
  stage: ItemReading,
  chartLabels: ReadonlyMap<string, SpanLabel>,
): SpanLabel[] {
  const known: SpanLabels = new Map(
    [...chartLabels].map(([id, label]) => [id, { ...label, designators: [...label.designators] }]),
  );
  const labels: SpanLabels = new Map();
  for (const { path, span } of spansOfItem(item, stage)) {
    const designator = designatorOf(path, item.key);
    if (!designator) continue;
    const spanLabel = spanLabelOf(known, span);
    if (!spanLabel) continue;
    if (!spanLabel.designators.some((d) => d.key === item.key)) {
      spanLabel.designators = [...spanLabel.designators, placedOn(designator, span, spanLabel)];
    }
    spanLabel.designators = spanLabel.designators.toSorted(byStack);
    labels.set(spanLabel.id, spanLabel);
  }
  return [...labels.values()];
}

/** What a label's rank in the draw stack is: that of its front designator. */
const frontRank = ({ designators }: SpanLabel) => Math.min(...designators.map((d) => d.rank));

/**
 * The spans that draw a label, the one with the rearmost front designator first, each with its
 * designators in draw-stack order: every airway that fits its span, and each procedure on the
 * first span that has room for it as well. A procedure's span may come after an airway's in
 * the span labels, so the order is by rank, not by insertion.
 */
function designatedSpans(stage: Stage): SpanLabel[] {
  const spanLabels = airwayLabels(stage);
  settleAirways(spanLabels, stage);
  for (const item of procedureItems(stage.drawnItems)) nameProcedure(item, spanLabels, stage);
  const drawn = [...spanLabels.values()].filter((spanLabel) => spanLabel.shown);
  for (const spanLabel of drawn) spanLabel.designators = spanLabel.designators.toSorted(byStack);
  return drawn.toReversed().toSorted((a, b) => frontRank(b) - frontRank(a));
}

/** The gap in the line: CSS px past the text each side, and across. */
const GAP_MARGIN_PX = 4;
const GAP_HEIGHT_PX = 12;
/** A chevron's V: CSS px deep along the reading, across, and its stroke. */
const CHEVRON_DEPTH_PX = 5;
const CHEVRON_ACROSS_PX = 7;
const CHEVRON_STROKE_PX = 1.3;

/** What a label draws: the gaps cut in the lines, its text, and the chevrons beside the text. */
export interface RouteLabelOut {
  gaps: LineBatch;
  text: TextBatch;
  strokes: LineBatch;
}

/** An offset along and across a label turned by its angle, as the offset of an anchor. */
const turned = (x: number, y: number, angle: number) => ({
  px: x * Math.cos(angle) - y * Math.sin(angle),
  py: x * Math.sin(angle) + y * Math.cos(angle),
});

/** A chevron from `slot` along the label: a V, pointing the way the route is flown. */
function putChevron(
  { middle }: SpanLabel,
  slot: number,
  ahead: boolean,
  color: string,
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
  const at = (x: number, y: number) => ({ ...middle.at, ...turned(x, y, middle.angle) });
  for (const side of [-1, 1]) {
    const arm = at(arms, (side * CHEVRON_ACROSS_PX) / 2);
    out.strokes.segment(arm, at(tip, 0), color, { width: CHEVRON_STROKE_PX });
  }
}

/** Puts the designators of a span along it, each with its chevron, on a gap cut in the line. */
export function putLabel(spanLabel: SpanLabel, out: RouteLabelOut) {
  const { middle, designators } = spanLabel;
  const { angle } = middle;
  const total = widthOf(designators, out.text);
  const style = { baseline: 'middle', angle, halo: true } as const;
  let pen = -total / 2;
  for (const { name, label, oneWay, reads } of designators) {
    const width = out.text.measure(name, label.size);
    const before = oneWay && !reads;
    const textAt = before ? pen + CHEVRON_PX : pen;
    const at = { ...middle.at, px: textAt, py: 0 };
    out.text.text(name, at, label.size, label.color, style);
    if (oneWay) {
      const slot = before ? pen : pen + width + CHEVRON_CLEAR_PX;
      putChevron(spanLabel, slot, reads, label.color, out);
    }
    pen += width + (oneWay ? CHEVRON_PX : 0) + SEPARATOR_PX;
  }
  const half = total / 2 + GAP_MARGIN_PX;
  const end = (sign: number) => ({ ...middle.at, ...turned(sign * half, 0, angle) });
  out.gaps.segment(end(-1), end(1), PALETTE.bg, { width: GAP_HEIGHT_PX });
}

/**
 * The labels of the routes: each span a drawn airway runs along gets one label listing every
 * designator that runs along it, centred on the span's midpoint and set along it, and each
 * drawn procedure is named once, on the first span that has room for it. A label that does not
 * fit its span at the settled scale is left out: its width and 28 px must fit the span's length
 * on screen less the stop cuts. Returns the gaps cut in the lines, the text, then the chevrons
 * of the one-way routes, back to front through the draw stack, and the span labels drawn.
 */
export function buildRouteLabels(input: LabelsInput & FitInput): BuiltLabels {
  const out: RouteLabelOut = {
    gaps: new LineBatch(),
    text: new TextBatch(input.atlas),
    strokes: new LineBatch(),
  };
  const spanLabels = designatedSpans({ ...input, scale: input.settledScale(), text: out.text });
  for (const spanLabel of spanLabels) putLabel(spanLabel, out);
  return {
    batches: [out.gaps.finish(), out.text.finish(), out.strokes.finish()],
    spanLabels: new Map(spanLabels.map((spanLabel) => [spanLabel.id, spanLabel])),
  };
}
