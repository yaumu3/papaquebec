/** Which designators label which span of the routes. */

import { nameOf } from '../../lib/chart';
import { rememberFits, type ShownMemory } from '../../lib/fits';
import type { ProjectFn } from '../../lib/geo';
import { geodesicLine } from '../../lib/geodesic';
import { DRAW_STACK, isAirwayLayer } from '../../lib/layers';
import { lengthOf, type Midpoint, midpointOf, readingAngle } from '../../lib/polyline';
import { type Cuts, type Span, spanIdentity, spansOf } from '../../lib/stops';
import type { ChartPath } from '../../lib/topology';
import type { LabelsInput } from './chart';
import { LAYER_STYLES, type LabelStyle, labelReaches } from './layerStyles';
import type { TextBatch } from './pack';
import { partsOf } from './runs';

/** CSS px between two designators of a label. */
export const SEPARATOR_PX = 9;
/** CSS px a label needs besides its text before it is shown: room for the line either side. */
const MARGIN_PX = 28;

/** One name on a label, in its layer's label style. */
interface Designator {
  name: string;
  label: LabelStyle;
  /** Where its layer stands in the draw stack, front first. */
  rank: number;
}

/** Where a span's label sits and how it reads. */
interface Geometry {
  middle: Midpoint;
  angle: number;
  /** World length of the span. */
  length: number;
}

/** A span, and the designators its label lists: none while it draws no label. */
export interface Entry {
  id: string;
  span: Span;
  geometry: Geometry;
  designators: Designator[];
}

type Entries = Map<string, Entry>;

/** What the stages read: the build's input, the cuts at the stops and the text to measure. */
export interface Stage extends LabelsInput {
  cuts: Cuts;
  shown: ShownMemory;
  scale: number;
  text: TextBatch;
}

const byStack = (a: Designator, b: Designator) => a.rank - b.rank || a.name.localeCompare(b.name);

/** The designator of a path's part in its layer's label style, if the density reaches it. */
function designatorOf(path: ChartPath, density: LabelsInput['labelDensity']) {
  const label = LAYER_STYLES[path.layer].label;
  const name = nameOf(path.part);
  if (!label || name === undefined || !labelReaches(label, density)) return undefined;
  return { name, label, rank: DRAW_STACK.indexOf(path.layer) };
}

/** The entry of a span, found or made; none for a span with no length. */
function entryOf(entries: Entries, path: ChartPath, span: Span, project: ProjectFn) {
  const id = spanIdentity(path, span);
  const known = entries.get(id);
  if (known) return known;
  const line = geodesicLine(path.coordinates.slice(span.from, span.to + 1), project);
  const middle = midpointOf(line);
  if (!middle) return undefined;
  const geometry = { middle, angle: readingAngle(middle.direction).angle, length: lengthOf(line) };
  const made = { id, span, geometry, designators: [] };
  entries.set(id, made);
  return made;
}

/** The text a label of these designators takes, in CSS px. */
export function widthOf(designators: readonly Designator[], text: TextBatch): number {
  const names = designators.reduce((sum, d) => sum + text.measure(d.name, d.label.size), 0);
  return names + SEPARATOR_PX * Math.max(0, designators.length - 1);
}

/** What the span has to spare on the screen at the settled scale, less the cuts at its stops. */
const roomOf = ({ geometry, span }: Entry, scale: number) =>
  geometry.length * scale - span.cutBack - span.cutAhead;

/** The airway designators of the drawn parts, by the span they run along. */
function airwayEntries(stage: Stage): Entries {
  const { topology, drawnItems, project, labelDensity, cuts } = stage;
  const drawn = partsOf(drawnItems);
  const entries: Entries = new Map();
  for (const path of topology.routes.paths) {
    const designator = isAirwayLayer(path.layer) && designatorOf(path, labelDensity);
    if (!designator || !drawn.has(path.part)) continue;
    for (const span of spansOf(path, cuts)) {
      const entry = entryOf(entries, path, span, project);
      const present = entry?.designators.some(
        (d) => d.name === designator.name && d.rank === designator.rank,
      );
      if (entry && !present) entry.designators.push(designator);
    }
  }
  return entries;
}

/** Empties the entries whose labels do not fit; the rest stay as they are. */
function settleAirways(entries: Entries, stage: Stage) {
  for (const entry of entries.values()) {
    const threshold = widthOf(entry.designators, stage.text) + MARGIN_PX;
    if (!rememberFits(stage.shown, entry.id, roomOf(entry, stage.scale), threshold)) {
      entry.designators = [];
    }
  }
}

/**
 * The spans that draw a label, the rearmost first, each with its designators in draw-stack
 * order: every airway that fits its span.
 */
export function designatedSpans(stage: Stage): Entry[] {
  const entries = airwayEntries(stage);
  settleAirways(entries, stage);
  const drawn = [...entries.values()].filter((entry) => entry.designators.length > 0);
  for (const entry of drawn) entry.designators = entry.designators.toSorted(byStack);
  return drawn.toReversed();
}
