/** How an area item's label is laid out: its rows of text and the rules between them. */

import { CHART_COLORS } from '../../design/palette';
import { type ChartItem, itemFrequency } from '../../lib/chart';
import type { LabelDensity, LabelStyle } from '../../lib/layers';
import { fractionOf, stratumTag } from '../../lib/stratum';
import { type LabelOut, putStroke, putText } from './drawnLabels';
import type { Anchor, TextBatch } from './pack';

/** A sector's details are in 9 px, set 6 px apart from the name and from each other. */
const DETAIL_SIZE_PX = 9;
const DETAIL_GAP_PX = 6;
/** A fraction: 8 px, its upper limit 10 px below the name, a rule 5.5 px below it, the lower 5.5 px more. */
const FRACTION_SIZE_PX = 8;
const UPPER_Y = 10;
const RULE_Y = 15.5;
const LOWER_Y = 21;
/** The height of a line of text, CSS px: what a row takes in a stack. */
const ROW_PX = 12;

/** A piece of text on a row of a block, `x` CSS px from the row's start. */
interface Run {
  text: string;
  size: number;
  color: string;
  x: number;
}

/** A row of runs, centred on the block, `y` CSS px below the block's centre. */
interface Row {
  /** The key of the item the row names. */
  key: string;
  runs: Run[];
  width: number;
  y: number;
}

/** A rule between two rows, `width` CSS px wide, `y` CSS px below the block's centre. */
interface Rule {
  /** The key of the item the rule belongs to. */
  key: string;
  y: number;
  width: number;
  color: string;
}

/** What an area's label says, as rows of runs and the rules between them, and how wide it is. */
interface Block {
  rows: Row[];
  rules: Rule[];
  width: number;
}

/** What a sector adds to its name at DENSE: its first frequency and its stratum, as it has them. */
const detailsOf = (item: ChartItem): string[] =>
  [itemFrequency(item) ?? '', stratumTag(item.parts)].filter((detail) => detail !== '');

/** A row of one run, centred. */
const rowOf = (
  key: string,
  text: string,
  size: number,
  color: string,
  y: number,
  width: number,
): Row => ({
  key,
  runs: [{ text, size, color, x: 0 }],
  width,
  y,
});

/** The name on one row, a sector's details after it. */
function nameRow(
  item: ChartItem,
  name: string,
  label: LabelStyle,
  density: LabelDensity,
  text: TextBatch,
): Row {
  const details = item.layer === 'sector' && density === 'dense' ? detailsOf(item) : [];
  const runs: Run[] = [{ text: name, size: label.size, color: label.color, x: 0 }];
  let width = text.measure(name, label.size);
  for (const detail of details) {
    runs.push({
      text: detail,
      size: DETAIL_SIZE_PX,
      color: CHART_COLORS.sectorDetail,
      x: width + DETAIL_GAP_PX,
    });
    width += DETAIL_GAP_PX + text.measure(detail, DETAIL_SIZE_PX);
  }
  return { key: item.key, runs, width, y: 0 };
}

/**
 * The block of an item: its name on one row, a sector's details after it at DENSE, and under the
 * name of any other area at DENSE its limits as a fraction, upper over lower with a rule between.
 * The block is centred on the pole: the name above it, the limits below.
 */
export function blockOf(
  item: ChartItem,
  name: string,
  label: LabelStyle,
  density: LabelDensity,
  text: TextBatch,
): Block {
  const first = nameRow(item, name, label, density, text);
  const fraction =
    item.layer === 'sector' || density !== 'dense' ? undefined : fractionOf(item.parts);
  if (!fraction) return { rows: [first], rules: [], width: first.width };
  const [upper, lower] = [fraction.upper, fraction.lower].map((s) =>
    text.measure(s, FRACTION_SIZE_PX),
  );
  const top = -LOWER_Y / 2;
  const rows = [
    { ...first, y: top },
    rowOf(item.key, fraction.upper, FRACTION_SIZE_PX, label.color, top + UPPER_Y, upper ?? 0),
    rowOf(item.key, fraction.lower, FRACTION_SIZE_PX, label.color, top + LOWER_Y, lower ?? 0),
  ];
  const rule = {
    key: item.key,
    y: top + RULE_Y,
    width: Math.max(upper ?? 0, lower ?? 0),
    color: label.color,
  };
  return { rows, rules: [rule], width: Math.max(...rows.map((row) => row.width)) };
}

/** Puts a block's rows and rules centred on `at`, shifted by its px offsets. */
export function putBlock({ rows, rules }: Block, at: Anchor, out: LabelOut) {
  const style = { baseline: 'middle', halo: true } as const;
  for (const row of rows) {
    for (const run of row.runs) {
      const anchor = { ...at, px: run.x - row.width / 2 + (at.px ?? 0), py: row.y + (at.py ?? 0) };
      putText(out, row.key, {
        text: run.text,
        at: anchor,
        size: run.size,
        color: run.color,
        style,
      });
    }
  }
  for (const { key, y, width, color } of rules) {
    const end = (sign: number) => ({
      ...at,
      px: (sign * width) / 2 + (at.px ?? 0),
      py: y + (at.py ?? 0),
    });
    putStroke(out, key, { from: end(-1), to: end(1), color, width: 1 });
  }
}

/**
 * Puts a block with its name, the first run of its first row, at `name`: the rest of the row
 * and the rows below follow it, as a block laid out for DENSE hangs off a name the chart drew.
 */
export function putBlockAtName(block: Block, name: Anchor, out: LabelOut) {
  const [first] = block.rows;
  if (!first) return;
  const at = { ...name, px: (name.px ?? 0) + first.width / 2, py: (name.py ?? 0) - first.y };
  putBlock(block, at, out);
}

/** How much of a stack a block takes: the distance across its rows and a line. */
const heightOf = ({ rows }: Block): number => {
  const ys = rows.map((row) => row.y);
  return Math.max(...ys) - Math.min(...ys) + ROW_PX;
};

/** Blocks one under another, each centred in its own height, the whole centred on the origin. */
export function stackedBlock(blocks: readonly Block[]): Block {
  const heights = blocks.map(heightOf);
  let top = -heights.reduce((sum, h) => sum + h, 0) / 2;
  const placed = blocks.map((block, i) => {
    const shift = top + (heights[i] ?? 0) / 2;
    top += heights[i] ?? 0;
    return {
      rows: block.rows.map((row) => ({ ...row, y: row.y + shift })),
      rules: block.rules.map((rule) => ({ ...rule, y: rule.y + shift })),
    };
  });
  return {
    rows: placed.flatMap((b) => b.rows),
    rules: placed.flatMap((b) => b.rules),
    width: Math.max(...blocks.map((b) => b.width)),
  };
}
