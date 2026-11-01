/** Which designators label which span of the routes. */

import { type ChartItem, gridIdentity, itemName, nameOf } from '../../lib/chart';
import { fits, rememberFits, type ShownMemory } from '../../lib/fits';
import type { ProjectFn } from '../../lib/geo';
import { geodesicLine } from '../../lib/geodesic';
import { DRAW_STACK, isAirwayLayer, isProcedureLayer } from '../../lib/layers';
import { lengthOf, type Midpoint, midpointOf, readingAngle } from '../../lib/polyline';
import { type Cuts, type Span, spanIdentity, spansOf } from '../../lib/stops';
import type { ChartPath } from '../../lib/topology';
import type { LabelsInput } from './chart';
import { LAYER_STYLES, type LabelStyle, labelReaches } from './layerStyles';
import type { TextBatch } from './pack';

/** CSS px between two designators of a label. */
export const SEPARATOR_PX = 9;
/** CSS px a chevron takes along a label, and the clear space between it and its name. */
export const CHEVRON_SLOT_PX = 7;
export const CHEVRON_CLEAR_PX = 3;
/** CSS px a one-way designator takes beside its name. */
export const CHEVRON_PX = CHEVRON_SLOT_PX + CHEVRON_CLEAR_PX;
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

/** The grid identity where a path starts a span. */
const startOf = (path: ChartPath, span: Span): string =>
  gridIdentity(path.coordinates[span.from] ?? [0, 0]);

/** A designator on a span: whether its route is flown along the label's reading direction. */
interface Placed extends Designator {
  reads: boolean;
}

/** A span, the designators along it, and whether it draws its label. */
export interface SpanLabel {
  id: string;
  span: Span;
  middle: Midpoint;
  angle: number;
  /** The text was turned half a circle from the span's direction to read upright. */
  flipped: boolean;
  /** World length of the span. */
  length: number;
  /** The grid identity where the span's first path starts. */
  start: string;
  designators: Placed[];
  /** The span draws its label: its airways fit, or a procedure joined it. */
  shown: boolean;
}

type SpanLabels = Map<string, SpanLabel>;

/** What the stages read: the build's input, the cuts at the stops and the text to measure. */
interface Stage extends LabelsInput {
  cuts: Cuts;
  shown: ShownMemory;
  scale: number;
  text: TextBatch;
}

/** Draw-stack order, then by name. */
const byStack = (a: { rank: number; name: string }, b: { rank: number; name: string }) =>
  a.rank - b.rank || a.name.localeCompare(b.name);

/** The designator of a path's part, of the item `key`, in its layer's label style, if it has one. */
function designatorOf(path: ChartPath, key: string) {
  const label = LAYER_STYLES[path.layer].label;
  const name = nameOf(path.part);
  if (!label || name === undefined) return undefined;
  const { properties } = path.part;
  const oneWay = 'oneWay' in properties && properties.oneWay === true;
  return { key, name, label, rank: DRAW_STACK.indexOf(path.layer), oneWay };
}

/** The designator of a path's part, if the density reaches its layer's label. */
function reachedDesignatorOf(path: ChartPath, key: string, density: LabelsInput['labelDensity']) {
  const designator = designatorOf(path, key);
  return designator && labelReaches(designator.label, density) ? designator : undefined;
}

/** A designator on a span's label: `reads` when its route is flown the way the label reads. */
function placedOn(
  designator: Designator,
  path: ChartPath,
  span: Span,
  spanLabel: SpanLabel,
): Placed {
  const starts = startOf(path, span) === spanLabel.start;
  return { ...designator, reads: starts !== spanLabel.flipped };
}

/** The label of a span, found or made; none for a span with no length. */
function spanLabelOf(spanLabels: SpanLabels, path: ChartPath, span: Span, project: ProjectFn) {
  const id = spanIdentity(path, span);
  const known = spanLabels.get(id);
  if (known) return known;
  const line = geodesicLine(path.coordinates.slice(span.from, span.to + 1), project);
  const middle = midpointOf(line);
  if (!middle) return undefined;
  const start = startOf(path, span);
  const made: SpanLabel = {
    id,
    span,
    middle,
    ...readingAngle(middle.direction),
    length: lengthOf(line),
    start,
    designators: [],
    shown: false,
  };
  spanLabels.set(id, made);
  return made;
}

/** The text a label of these designators takes, in CSS px. */
export function widthOf(designators: readonly Designator[], text: TextBatch): number {
  const names = designators.reduce(
    (sum, d) => sum + text.measure(d.name, d.label.size) + (d.oneWay ? CHEVRON_PX : 0),
    0,
  );
  return names + SEPARATOR_PX * Math.max(0, designators.length - 1);
}

/** What the span has to spare on the screen at the settled scale, less the cuts at its stops. */
const roomOf = ({ length, span }: SpanLabel, scale: number) =>
  length * scale - span.cutBack - span.cutAhead;

/** The airway designators of the drawn parts, by the span they run along. */
function airwayLabels(stage: Stage): SpanLabels {
  const { topology, drawnItems, project, labelDensity, cuts } = stage;
  const keys = new Map(drawnItems.flatMap((item) => item.parts.map((part) => [part, item.key])));
  const spanLabels: SpanLabels = new Map();
  for (const path of topology.routes.paths) {
    const key = keys.get(path.part);
    const designator =
      key !== undefined &&
      isAirwayLayer(path.layer) &&
      reachedDesignatorOf(path, key, labelDensity);
    if (!designator) continue;
    for (const span of spansOf(path, cuts)) {
      const spanLabel = spanLabelOf(spanLabels, path, span, project);
      const present = spanLabel?.designators.some(
        (d) => d.name === designator.name && d.rank === designator.rank,
      );
      if (spanLabel && !present)
        spanLabel.designators.push(placedOn(designator, path, span, spanLabel));
    }
  }
  return spanLabels;
}

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
    .map((item) => ({ item, rank: DRAW_STACK.indexOf(item.layer), name: itemName(item) ?? '' }))
    .toSorted(byStack)
    .map(({ item }) => item);
}

/** The spans of an item, taking its parts in order and the spans of each in path order. */
function* spansOfItem(item: ChartItem, { topology, cuts }: Pick<Stage, 'topology' | 'cuts'>) {
  for (const part of item.parts) {
    for (const path of topology.routes.paths.filter((p) => p.part === part)) {
      for (const span of spansOf(path, cuts)) yield { path, span };
    }
  }
}

/**
 * Names a procedure on the first span where the label with its designator added, every airway
 * along the span included, passes the room test with the span's remembered state; the whole
 * label is then drawn. A span it fails keeps whether it draws its label.
 */
function nameProcedure(item: ChartItem, spanLabels: SpanLabels, stage: Stage) {
  const { project, labelDensity, shown, scale, text } = stage;
  for (const { path, span } of spansOfItem(item, stage)) {
    const designator = reachedDesignatorOf(path, item.key, labelDensity);
    const spanLabel = designator && spanLabelOf(spanLabels, path, span, project);
    if (!spanLabel) continue;
    const named = [...spanLabel.designators, placedOn(designator, path, span, spanLabel)];
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
  stage: Pick<Stage, 'topology' | 'cuts' | 'project'>,
  chartLabels: ReadonlyMap<string, SpanLabel>,
): SpanLabel[] {
  const known: SpanLabels = new Map(
    [...chartLabels].map(([id, label]) => [id, { ...label, designators: [...label.designators] }]),
  );
  const labels: SpanLabels = new Map();
  for (const { path, span } of spansOfItem(item, stage)) {
    const designator = designatorOf(path, item.key);
    if (!designator) continue;
    const spanLabel = spanLabelOf(known, path, span, stage.project);
    if (!spanLabel) continue;
    if (!spanLabel.designators.some((d) => d.key === item.key)) {
      spanLabel.designators = [
        ...spanLabel.designators,
        placedOn(designator, path, span, spanLabel),
      ];
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
export function designatedSpans(stage: Stage): SpanLabel[] {
  const spanLabels = airwayLabels(stage);
  settleAirways(spanLabels, stage);
  for (const item of procedureItems(stage.drawnItems)) nameProcedure(item, spanLabels, stage);
  const drawn = [...spanLabels.values()].filter((spanLabel) => spanLabel.shown);
  for (const spanLabel of drawn) spanLabel.designators = spanLabel.designators.toSorted(byStack);
  return drawn.toReversed().toSorted((a, b) => frontRank(b) - frontRank(a));
}
