/** How an area item's label is laid out: its rows of text and the rules between them. */

import { type ChartItem, itemFrequency } from '../../lib/chart';
import type { Vec2 } from '../../lib/geo';
import { fractionOf, stratumTag } from '../../lib/stratum';
import type { LabelDensity } from '../../state/settingsDefaults';
import type { LabelStyle } from './layerStyles';
import type { LineBatch, TextBatch } from './pack';
import { THEME } from './rules';

/** A sector's details are in 9 px, set 6 px apart from the name and from each other. */
const DETAIL_SIZE_PX = 9;
const DETAIL_GAP_PX = 6;
/** A fraction: 8 px, its upper limit 10 px below the name, a rule 5.5 px below it, the lower 5.5 px more. */
const FRACTION_SIZE_PX = 8;
const UPPER_Y = 10;
const RULE_Y = 15.5;
const LOWER_Y = 21;

/** A piece of text on a row of a block, `x` CSS px from the row's start. */
interface Run {
  text: string;
  size: number;
  color: string;
  x: number;
}

/** A row of runs, centred on the block, `y` CSS px below the block's centre. */
interface Row {
  runs: Run[];
  width: number;
  y: number;
}

/** A rule between two rows, `width` CSS px wide, `y` CSS px below the block's centre. */
interface Rule {
  y: number;
  width: number;
  color: string;
}

/** What an area's label says, as rows of runs and the rules between them, and how wide it is. */
export interface Block {
  rows: Row[];
  rules: Rule[];
  width: number;
}

/** What a sector adds to its name at DENSE: its first frequency and its stratum, as it has them. */
const detailsOf = (item: ChartItem): string[] =>
  [itemFrequency(item) ?? '', stratumTag(item.parts)].filter((detail) => detail !== '');

/** A row of one run, centred. */
const rowOf = (text: string, size: number, color: string, y: number, width: number): Row => ({
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
      color: THEME.sectorDetail,
      x: width + DETAIL_GAP_PX,
    });
    width += DETAIL_GAP_PX + text.measure(detail, DETAIL_SIZE_PX);
  }
  return { runs, width, y: 0 };
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
    rowOf(fraction.upper, FRACTION_SIZE_PX, label.color, top + UPPER_Y, upper ?? 0),
    rowOf(fraction.lower, FRACTION_SIZE_PX, label.color, top + LOWER_Y, lower ?? 0),
  ];
  const rule = { y: top + RULE_Y, width: Math.max(upper ?? 0, lower ?? 0), color: label.color };
  return { rows, rules: [rule], width: Math.max(...rows.map((row) => row.width)) };
}

/** Puts a block's rows and rules centred on `at`. */
export function putBlock(
  { rows, rules }: Block,
  at: Vec2,
  out: { text: TextBatch; rules: LineBatch },
) {
  for (const row of rows) {
    for (const run of row.runs) {
      const anchor = { ...at, px: run.x - row.width / 2, py: row.y };
      out.text.text(run.text, anchor, run.size, run.color, { baseline: 'middle', halo: true });
    }
  }
  for (const { y, width, color } of rules) {
    const end = (sign: number) => ({ ...at, px: (sign * width) / 2, py: y });
    out.rules.segment(end(-1), end(1), color, { width: 1 });
  }
}
