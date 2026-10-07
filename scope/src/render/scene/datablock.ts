import { type Altimeter, formatAltitude, holdsSelected, uncorrected } from '../../lib/altitude';
import { steeringHeading } from '../../lib/autopilot';
import { blockHeight, DB_FONT_PX, DB_LINE, DB_WIDTH, leader, leaderTip } from '../../lib/datablock';
import { climbArrow, emergencyCode, formatGsWake, padBearing } from '../../lib/format';
import type { Track } from '../../state/track';
import type { Anchor, LineBatch, TextBatch } from './pack';
import { isEmergency, THEME, trackLabel, typeLabel } from './rules';

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
  const trend = plain(level + climbArrow(t.verticalRate));
  return t.selAlt === undefined
    ? [trend]
    : [trend, intent(formatAltitude(t.selAlt, uncorrected(altimeter)))];
}

/**
 * Identity, then level, trend and selected level with either the type or
 * ground speed with wake, alternating every 8 s on one shared clock so every
 * block reads the same field at the same time, then the selected heading.
 */
export function dataBlock(t: Track, nowSec: number, altimeter: Altimeter): DataBlock {
  const showType = Math.floor(nowSec / DATA_BLOCK_PERIOD_SEC) % 2 === 0;
  const second = showType ? typeLabel(t) : formatGsWake(t.gs, t.category);
  return {
    prefix: emergencyCode(t.squawk, t.emergency),
    line1: trackLabel(t),
    line2: [...levelRuns(t, altimeter), plain(` ${second}`)],
    line3: headingLine(t),
  };
}

/** Brightness of downlinked intent against the block's own color. */
export const INTENT_TONE = 0.65;
/** Brightness of a leader against the block's color, unless emphasised. */
const LEADER_TONE = 0.5;

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
  /** Offset from the target to the block's top-left corner, CSS px. */
  dx: number;
  dy: number;
  color: string;
  /** Keeps the leader at full brightness, as for a selected or hovered target. */
  emphasised: boolean;
}

/**
 * Where a line of `width` starts in a block whose top-left corner is at `dx`: at the leader's
 * tip, or as near it as keeps the line within the block. So a block east of its target reads
 * from the tip, one west of it ends at the tip, and a dragged block slides between the two.
 */
function lineStart(tipX: number, dx: number, width: number): number {
  return Math.max(dx, Math.min(tipX, dx + DB_WIDTH - width));
}

/** One line of runs, laid out as a single string would be. */
function drawRuns(
  text: TextBatch,
  runs: Run[],
  at: Anchor,
  colors: { plain: string; intent: string },
): void {
  let px = at.px ?? 0;
  for (const r of runs) {
    text.text(r.text, { ...at, px }, DB_FONT_PX, r.intent ? colors.intent : colors.plain);
    px += text.measure(r.text, DB_FONT_PX);
  }
}

/** The leader from the glyph's edge to a block `heightPx` tall. */
export function drawLeader(
  lines: LineBatch,
  { at, dx, dy, color, emphasised }: BlockPlacement,
  heightPx: number,
): void {
  const { a, b } = leader(dx, dy, heightPx);
  lines.segment(
    { ...at, px: a.x, py: a.y },
    { ...at, px: b.x, py: b.y },
    emphasised ? color : dim(color, LEADER_TONE),
  );
}

export function drawDataBlock(
  lines: LineBatch,
  text: TextBatch,
  block: DataBlock,
  placement: BlockPlacement,
): void {
  const { at, dx, dy, color } = placement;
  const h = blockHeight(blockExtraLines(block));
  drawLeader(lines, placement, h);
  const tipX = leaderTip(dx, dy, h).x;
  const anchor = (s: string, row: number): Anchor => ({
    ...at,
    px: lineStart(tipX, dx, text.measure(s, DB_FONT_PX)),
    py: dy + row * DB_LINE,
  });
  const top = block.prefix ? 1 : 0;
  if (block.prefix) text.text(block.prefix, anchor(block.prefix, 0), DB_FONT_PX, THEME.emergency);
  const colors = { plain: color, intent: dim(color, INTENT_TONE) };
  text.text(block.line1, anchor(block.line1, top), DB_FONT_PX, color);
  drawRuns(text, block.line2, anchor(block.line2.map((r) => r.text).join(''), top + 1), colors);
  if (block.line3) text.text(block.line3, anchor(block.line3, top + 2), DB_FONT_PX, colors.intent);
}
