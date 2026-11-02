/** The labels of the routes: which designators label which span, and how each label draws. */

import { PALETTE } from '../../design/palette';
import { type ChartItem, itemName, nameOf } from '../../lib/chart';
import { fits, rememberFits, type ShownMemory } from '../../lib/fits';
import {
  DEFAULT_LINE_WIDTH,
  isAirwayLayer,
  isProcedureLayer,
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
/** CSS px a chevron alone needs before it is shown. */
const CHEVRON_ROOM_PX = CHEVRON_SLOT_PX + MARGIN_PX;

/** One name on a label, in its layer's label style; or, with no name, a chevron alone. */
interface Designator {
  /** The key of its item. */
  key: string;
  name: string;
  /** The size of its name, CSS px. */
  size: number;
  color: string;
  /** Where its layer stands in the draw stack, front first. */
  rank: number;
  /** Its route is flown one way only. */
  oneWay: boolean;
}

/**
 * A designator on a span: whether its route is flown along the label's reading direction. With
 * no name it is its chevron alone.
 */
interface Placed extends Designator {
  reads: boolean;
}

/** A span of some length, the designators along it, and whether it draws its label. */
export interface SpanLabel extends RouteSpan {
  middle: NonNullable<RouteSpan['middle']>;
  designators: Placed[];
  /** The span names its designators: its airways fit, or a procedure joined it. */
  shown: boolean;
}

type SpanLabels = Map<string, SpanLabel>;

/** What the stages read: the build's input, the text to measure, and the item key of each part. */
interface Stage extends LabelsInput {
  shown: ShownMemory;
  scale: number;
  text: TextBatch;
  keys: ReadonlyMap<ChartPath['part'], string>;
}

/** Draw-stack order, then by name. */
const byStack = (a: { rank: number; name: string }, b: { rank: number; name: string }) =>
  a.rank - b.rank || a.name.localeCompare(b.name);

/** Whether a path's part is flown one way only. */
const isOneWay = ({ properties }: ChartPath['part']) =>
  'oneWay' in properties && properties.oneWay === true;

/** The designator of a path's part, of the item `key`, in its layer's label style, if it has one. */
function designatorOf(path: ChartPath, key: string): Designator | undefined {
  const { style, rank } = LAYER_TABLE[path.layer];
  const name = nameOf(path.part);
  if (!style.label || name === undefined) return undefined;
  const { size, color } = style.label;
  return { key, name, size, color, rank, oneWay: isOneWay(path.part) };
}

/** The designator of a path's part, if the density reaches its layer's label. */
function reachedDesignatorOf(path: ChartPath, key: string, density: LabelsInput['labelDensity']) {
  const { label } = LAYER_TABLE[path.layer].style;
  return label && labelReaches(label, density) ? designatorOf(path, key) : undefined;
}

/**
 * The chevron alone of a one-way path's part, of the item `key`: in its layer's label colour, or
 * its line colour where the layer has no label. None for a part flown both ways.
 */
function chevronOf(path: ChartPath, key: string): Designator | undefined {
  const { style, rank } = LAYER_TABLE[path.layer];
  if (!isOneWay(path.part)) return undefined;
  return { key, name: '', size: 0, color: style.label?.color ?? style.color, rank, oneWay: true };
}

/** The item key of each part of `items`. */
const keysOf = (items: readonly ChartItem[]) =>
  new Map(items.flatMap((item) => item.parts.map((part) => [part, item.key])));

/** A designator on a span's label: `reads` when its route is flown the way the label reads. */
function placedOn(designator: Designator, span: RouteSpan, spanLabel: SpanLabel): Placed {
  return { ...designator, reads: (span.start === spanLabel.start) !== spanLabel.middle.flipped };
}

/** A span's label with nothing on it yet; none for a span with no length. */
function emptyLabel(span: RouteSpan): SpanLabel | undefined {
  const { middle } = span;
  return middle && { ...span, middle, designators: [], shown: false };
}

/** The label of a span, found or made. */
function spanLabelOf(spanLabels: SpanLabels, span: RouteSpan) {
  const label = spanLabels.get(span.id) ?? emptyLabel(span);
  if (label) spanLabels.set(span.id, label);
  return label;
}

/** The designator as its chevron alone. */
const chevronAlone = (designator: Placed): Placed => ({ ...designator, name: '' });

/** CSS px a designator takes along a label, its chevron included. */
function advanceOf({ name, size, oneWay }: Designator, text: TextBatch) {
  if (!name) return CHEVRON_SLOT_PX;
  return text.measure(name, size) + (oneWay ? CHEVRON_PX : 0);
}

/** The text a label of these designators takes, in CSS px. */
function widthOf(designators: readonly Designator[], text: TextBatch): number {
  const names = designators.reduce((sum, d) => sum + advanceOf(d, text), 0);
  return names + SEPARATOR_PX * Math.max(0, designators.length - 1);
}

/** The CSS px a label needs of its span before it is shown; lone chevrons ask for none of it. */
const thresholdOf = (designators: readonly Designator[], text: TextBatch) =>
  widthOf(
    designators.filter((d) => d.name),
    text,
  ) + MARGIN_PX;

/** What the span has to spare on the screen at the settled scale, less the cuts at its stops. */
const roomOf = ({ length, cutBack, cutAhead }: SpanLabel, scale: number) =>
  length * scale - cutBack - cutAhead;

/** The airway designators of the drawn parts, by the span they run along. */
function airwayLabels(stage: Stage): SpanLabels {
  const { topology, keys, routeSpans, labelDensity } = stage;
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
    const threshold = thresholdOf(spanLabel.designators, stage.text);
    const room = roomOf(spanLabel, stage.scale);
    spanLabel.shown = rememberFits(stage.shown, spanLabel.id, room, threshold);
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
    if (fits(roomOf(spanLabel, scale), thresholdOf(named, text), shown.get(spanLabel.id))) {
      spanLabel.designators = named;
      spanLabel.shown = true;
      shown.set(spanLabel.id, true);
      return;
    }
    shown.set(spanLabel.id, spanLabel.shown);
  }
}

/** Whether a designator's chevron points the way `placed`'s does. */
const pointsLike = ({ oneWay, reads }: Placed, placed: Placed) => oneWay && reads === placed.reads;

/**
 * Puts the chevron of each drawn one-way route on every span of it that has room for one, at any
 * density: beside what the span's label names, once a way.
 */
function putChevrons(spanLabels: SpanLabels, stage: Stage) {
  const { topology, keys, routeSpans, shown, scale } = stage;
  for (const path of topology.routes.paths) {
    const key = keys.get(path.part);
    const chevron = key !== undefined && chevronOf(path, key);
    if (!chevron) continue;
    for (const span of routeSpans(path)) {
      const spanLabel = spanLabelOf(spanLabels, span);
      if (!spanLabel) continue;
      const room = roomOf(spanLabel, scale);
      if (!rememberFits(shown, `chevron ${span.id}`, room, CHEVRON_ROOM_PX)) continue;
      const placed = placedOn(chevron, span, spanLabel);
      if (spanLabel.designators.some((d) => pointsLike(d, placed))) continue;
      spanLabel.designators.push(placed);
    }
  }
}

/**
 * What lighting an item reads: its spans, the settled scale, the text to measure, and what the
 * chart's labels showed last, read and never written, so a lit label agrees with the chart's.
 */
type LitReading = ItemReading & Pick<Stage, 'scale' | 'text' | 'shown'>;

/** A span of an item as it can be lit: its label with the item's name, or without it. */
interface LitSpan {
  named: SpanLabel;
  unnamed: SpanLabel;
}

/**
 * The chart's label of each span of an item, or none, by its identity, with and without its name.
 * The item's chevron takes the place of one the chart drew there for another route, and without
 * its name it stays if the span has room for it. A route with a chevron and no label has only
 * the latter.
 */
function litSpans(
  item: ChartItem,
  stage: LitReading,
  chartLabels: ReadonlyMap<string, SpanLabel>,
): LitSpan[] {
  const lit = new Map<string, LitSpan>();
  for (const { path, span } of spansOfItem(item, stage)) {
    const designator = designatorOf(path, item.key) ?? chevronOf(path, item.key);
    const label = chartLabels.get(span.id) ?? emptyLabel(span);
    if (!designator || !label || lit.has(span.id)) continue;
    const placed = placedOn(designator, span, label);
    const replaced = (d: Placed) => placed.oneWay && !d.name && pointsLike(d, placed);
    const others = label.designators.filter((d) => d.key !== item.key && !replaced(d));
    const joined = (d: Placed) => [...others, d].toSorted(byStack);
    const chevronFits =
      placed.oneWay &&
      fits(roomOf(label, stage.scale), CHEVRON_ROOM_PX, stage.shown.get(`chevron ${label.id}`));
    const unnamed = { ...label, designators: chevronFits ? joined(chevronAlone(placed)) : others };
    lit.set(span.id, {
      named: placed.name ? { ...label, designators: joined(placed) } : unnamed,
      unnamed,
    });
  }
  return [...lit.values()];
}

/** The spans a procedure is named on: those the chart names it on, else the first of them. */
function namedOnce(
  spans: LitSpan[],
  key: string,
  chartLabels: ReadonlyMap<string, SpanLabel>,
): LitSpan[] {
  const listed = spans.filter(({ named }) =>
    chartLabels.get(named.id)?.designators.some((d) => d.key === key && d.name),
  );
  return listed.length > 0 ? listed : spans.slice(0, 1);
}

/**
 * The labels to redraw for an item, whole: on every span of an airway that has room for its
 * designator by the chart's own test and memory, and for a procedure on the spans the chart
 * names it on, else on the first with room. No density gate. Other spans keep the chart's label over the trace, and the item's chevron
 * if it has room. The chart's labels are never changed.
 */
export function itemLabels(
  item: ChartItem,
  stage: LitReading,
  chartLabels: ReadonlyMap<string, SpanLabel>,
): SpanLabel[] {
  const { scale, text, shown } = stage;
  const spans = litSpans(item, stage, chartLabels);
  const roomy = spans.filter(({ named }) =>
    fits(roomOf(named, scale), thresholdOf(named.designators, text), shown.get(named.id)),
  );
  const lit = isProcedureLayer(item.layer) ? namedOnce(roomy, item.key, chartLabels) : roomy;
  return spans
    .map((span) => (lit.includes(span) ? span.named : span.unnamed))
    .filter((label) => label.designators.length > 0);
}

/** What a label's rank in the draw stack is: that of its front designator. */
const frontRank = ({ designators }: SpanLabel) => Math.min(...designators.map((d) => d.rank));

/**
 * The spans that draw a label, the one with the rearmost front designator first, each with its
 * designators in draw-stack order: every airway that fits its span, each procedure on the first
 * span that has room for it as well, and the chevrons of the one-way routes. A procedure's span
 * may come after an airway's in the span labels, so the order is by rank, not by insertion.
 */
function designatedSpans(stage: Stage): SpanLabel[] {
  const spanLabels = airwayLabels(stage);
  settleAirways(spanLabels, stage);
  for (const item of procedureItems(stage.drawnItems)) nameProcedure(item, spanLabels, stage);
  for (const spanLabel of spanLabels.values()) {
    if (!spanLabel.shown) spanLabel.designators = [];
  }
  putChevrons(spanLabels, stage);
  const drawn = [...spanLabels.values()].filter((spanLabel) => spanLabel.designators.length > 0);
  for (const spanLabel of drawn) spanLabel.designators = spanLabel.designators.toSorted(byStack);
  return drawn.toReversed().toSorted((a, b) => frontRank(b) - frontRank(a));
}

/** The gap in the line: CSS px past the text each side, and across. */
const GAP_MARGIN_PX = 4;
const GAP_HEIGHT_PX = 12;
/** A chevron's V: CSS px deep along the reading, and across. Its stroke is the line's. */
const CHEVRON_DEPTH_PX = 5;
const CHEVRON_ACROSS_PX = 7;

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
    out.strokes.segment(arm, at(tip, 0), color, { width: DEFAULT_LINE_WIDTH });
  }
}

/** An item a label draws in a colour of its own. */
interface LitDesignator {
  key: string;
  color: string;
}

/**
 * Puts the designators of a span along it, each with its chevron, on a gap cut in the line, the
 * designator of the `lit` item in its colour. Chevrons alone sit on the line, with no gap.
 */
export function putLabel(spanLabel: SpanLabel, out: RouteLabelOut, lit?: LitDesignator) {
  const { middle, designators } = spanLabel;
  const { angle } = middle;
  const total = widthOf(designators, out.text);
  const style = { baseline: 'middle', angle, halo: true } as const;
  let pen = -total / 2;
  for (const designator of designators) {
    const { key, name, size, oneWay, reads } = designator;
    const color = key === lit?.key ? lit.color : designator.color;
    const advance = advanceOf(designator, out.text);
    const before = oneWay && !reads;
    const textAt = before ? pen + CHEVRON_PX : pen;
    const at = { ...middle.at, px: textAt, py: 0 };
    out.text.text(name, at, size, color, style);
    if (oneWay) {
      const slot = before ? pen : pen + advance - CHEVRON_SLOT_PX;
      putChevron(spanLabel, slot, reads, color, out);
    }
    pen += advance + SEPARATOR_PX;
  }
  if (!designators.some((d) => d.name)) return;
  const half = total / 2 + GAP_MARGIN_PX;
  const end = (sign: number) => ({ ...middle.at, ...turned(sign * half, 0, angle) });
  out.gaps.segment(end(-1), end(1), PALETTE.bg, { width: GAP_HEIGHT_PX });
}

/**
 * The labels of the routes: each span a drawn airway runs along gets one label listing every
 * designator that runs along it, centred on the span's midpoint and set along it, and each
 * drawn procedure is named once, on the first span that has room for it. A label that does not
 * fit its span at the settled scale is left out: its width and 28 px must fit the span's length
 * on screen less the stop cuts. Only names follow the density and that test: a drawn one-way
 * route keeps its chevron wherever one fits, labelled layer or not. Returns the gaps cut in the lines, the text, then the
 * chevrons, back to front through the draw stack, and the span labels drawn.
 */
export function buildRouteLabels(input: LabelsInput & FitInput): BuiltLabels {
  const out: RouteLabelOut = {
    gaps: new LineBatch(),
    text: new TextBatch(input.atlas),
    strokes: new LineBatch(),
  };
  const spanLabels = designatedSpans({
    ...input,
    scale: input.settledScale(),
    text: out.text,
    keys: keysOf(input.drawnItems),
  });
  for (const spanLabel of spanLabels) putLabel(spanLabel, out);
  return {
    batches: [out.gaps.finish(), out.text.finish(), out.strokes.finish()],
    spanLabels: new Map(spanLabels.map((spanLabel) => [spanLabel.id, spanLabel])),
  };
}
