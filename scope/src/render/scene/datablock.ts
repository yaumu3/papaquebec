import {
  type Altimeter,
  formatAltitude,
  holdsSelected,
  STANDARD_ALTIMETER,
  uncorrected,
} from '../../lib/altitude';
import { steeringHeading } from '../../lib/autopilot';
import { climbArrow, emergencyCode, formatGsWake, padBearing } from '../../lib/format';
import type { Track } from '../../state/track';
import { DB_LINE } from '../layout/labels';
import type { Anchor, LineBatch, TextBatch } from './pack';
import { isEmergency, THEME, trackLabel } from './rules';

const DATA_BLOCK_PERIOD_SEC = 8;

/** A stretch of block text; `intent` sets it in the dimmed tone of downlinked intent. */
export interface Run {
  text: string;
  intent: boolean;
}

export interface DataBlock {
  prefix: 'HJ' | 'RF' | 'EM' | null;
  line1: string;
  line2: Run[];
  /** Selected heading, all intent; null when there is none to show. */
  line3: string | null;
}

const plain = (text: string): Run => ({ text, intent: false });
const intent = (text: string): Run => ({ text, intent: true });

/** Data block lines beyond the standard two. */
export function extraLines(t: Track): number {
  return (isEmergency(t) ? 1 : 0) + (headingLine(t) === null ? 0 : 1);
}

/** Lines of a built block beyond the standard two; always `extraLines` of its track. */
export function blockExtraLines(block: DataBlock): number {
  return (block.prefix ? 1 : 0) + (block.line3 === null ? 0 : 1);
}

function headingLine(t: Track): string | null {
  const heading = steeringHeading(t);
  return heading === undefined ? null : `${padBearing(heading)}°`;
}

/** Level and trend, then the selected level, or a check while the aircraft holds it. */
function levelRuns(t: Track, altimeter: Altimeter): Run[] {
  const level = formatAltitude(t.alt, altimeter);
  if (holdsSelected(t, altimeter)) return [plain(level), intent('✓')];
  const trend = plain(level + climbArrow(t.baroRate));
  return t.selAlt === undefined
    ? [trend]
    : [trend, intent(formatAltitude(t.selAlt, uncorrected(altimeter)))];
}

/**
 * Identity, then level, trend and selected level with either the type or
 * ground speed with wake, alternating every 8 s on one shared clock so every
 * block reads the same field at the same time, then the selected heading.
 */
export function dataBlock(
  t: Track,
  nowSec: number,
  altimeter: Altimeter = STANDARD_ALTIMETER,
): DataBlock {
  const showType = Math.floor(nowSec / DATA_BLOCK_PERIOD_SEC) % 2 === 0;
  const typeLabel = t.type ?? `[${t.category ?? '--'}]`;
  const second = showType ? typeLabel : formatGsWake(t.gs, t.category);
  return {
    prefix: emergencyCode(t.squawk, t.emergency),
    line1: trackLabel(t),
    line2: [...levelRuns(t, altimeter), plain(` ${second}`)],
    line3: headingLine(t),
  };
}

const FONT_PX = 11;
/** Brightness of downlinked intent against the block's own color. */
export const INTENT_TONE = 0.65;

function dim(hex: string, f: number): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const c = (v: number) =>
    Math.round(v * f)
      .toString(16)
      .padStart(2, '0');
  return `#${c((n >>> 16) & 255)}${c((n >>> 8) & 255)}${c(n & 255)}`;
}

/** Where a block sits and how it reads. */
export interface BlockPlacement {
  /** The target's world position. */
  at: Anchor;
  /** Offset from the target to the block's near corner, CSS px. */
  dx: number;
  dy: number;
  color: string;
  /** Keeps the leader at full brightness, as for a selected or hovered target. */
  emphasised: boolean;
}

/** One line of runs, laid out as a single string would be under `align`. */
function drawRuns(
  text: TextBatch,
  runs: Run[],
  at: Anchor,
  align: 'left' | 'right',
  colors: { plain: string; intent: string },
): void {
  const width = text.measure(runs.map((r) => r.text).join(''), FONT_PX);
  let px = (at.px ?? 0) - (align === 'right' ? width : 0);
  for (const r of runs) {
    text.text(r.text, { ...at, px }, FONT_PX, r.intent ? colors.intent : colors.plain);
    px += text.measure(r.text, FONT_PX);
  }
}

export function drawDataBlock(
  lines: LineBatch,
  text: TextBatch,
  block: DataBlock,
  { at, dx, dy, color, emphasised }: BlockPlacement,
): void {
  const right = dx > 0;
  const above = dy < 0;
  const blockY = dy - (above ? blockExtraLines(block) * DB_LINE : 0);
  const align = right ? 'left' : 'right';
  // Leader from the glyph edge to the block edge that faces the target.
  lines.segment(
    { ...at, px: right ? 3 : -3, py: above ? -3 : 3 },
    { ...at, px: right ? dx - 3 : dx + 3, py: above ? dy + 13 : blockY - 3 },
    emphasised ? color : dim(color, 0.5),
  );
  let lineY = blockY;
  if (block.prefix) {
    text.text(block.prefix, { ...at, px: dx, py: lineY }, FONT_PX, THEME.emergency, { align });
    lineY += DB_LINE;
  }
  const intentColor = dim(color, INTENT_TONE);
  text.text(block.line1, { ...at, px: dx, py: lineY }, FONT_PX, color, { align });
  drawRuns(text, block.line2, { ...at, px: dx, py: lineY + DB_LINE }, align, {
    plain: color,
    intent: intentColor,
  });
  if (block.line3) {
    text.text(block.line3, { ...at, px: dx, py: lineY + 2 * DB_LINE }, FONT_PX, intentColor, {
      align,
    });
  }
}
