/** What each item's label drew, kept so that it can be drawn again over the chart. */

import type { Batch } from '../protocol';
import type { Anchor, LineBatch, TextBatch, TextStyle } from './pack';
import type { SpanLabel } from './spanDesignators';

/** A run of text as it was drawn. */
export interface DrawnText {
  text: string;
  at: Anchor;
  size: number;
  color: string;
  style: TextStyle;
}

/** A segment as it was drawn: a rule, a chevron's arm or a gap. */
export interface DrawnStroke {
  from: Anchor;
  to: Anchor;
  color: string;
  width: number;
}

/** What one area or point item's label drew. */
export interface DrawnLabel {
  texts: DrawnText[];
  strokes: DrawnStroke[];
}

/** The drawn labels by the key of the item they name. */
export type DrawnLabels = Map<string, DrawnLabel>;

/** Where a label builder draws, and what it keeps. */
export interface LabelOut {
  text: TextBatch;
  strokes: LineBatch;
  drawn: DrawnLabels;
}

/** A build's batches, back to front, and what its labels drew. */
export interface BuiltLabels {
  batches: Batch[];
  /** What each area or point item's label drew. */
  drawn?: DrawnLabels;
  /** The span labels a route build drew, by span identity. */
  spanLabels?: ReadonlyMap<string, SpanLabel>;
}

const recordOf = (drawn: DrawnLabels, key: string): DrawnLabel => {
  const known = drawn.get(key);
  if (known) return known;
  const made: DrawnLabel = { texts: [], strokes: [] };
  drawn.set(key, made);
  return made;
};

const drawText = (text: TextBatch, run: DrawnText, color: string) =>
  text.text(run.text, run.at, run.size, color, run.style);

const drawStroke = (strokes: LineBatch, { from, to, width }: DrawnStroke, color: string) =>
  strokes.segment(from, to, color, { width });

/** Draws a run of the item `key`'s label, and keeps it. */
export function putText(out: Pick<LabelOut, 'text' | 'drawn'>, key: string, run: DrawnText) {
  drawText(out.text, run, run.color);
  recordOf(out.drawn, key).texts.push(run);
}

/** Draws a segment of the item `key`'s label, and keeps it. */
export function putStroke(
  out: Pick<LabelOut, 'strokes' | 'drawn'>,
  key: string,
  stroke: DrawnStroke,
) {
  drawStroke(out.strokes, stroke, stroke.color);
  recordOf(out.drawn, key).strokes.push(stroke);
}

/** Draws a label again: its text and its segments in `color`. */
export function redrawLabel(
  { texts, strokes }: DrawnLabel,
  color: string,
  out: { text: TextBatch; strokes: LineBatch },
) {
  for (const run of texts) drawText(out.text, run, color);
  for (const stroke of strokes) drawStroke(out.strokes, stroke, color);
}
