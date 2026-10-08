import { type Altimeter, formatAltitude, holdsSelected, uncorrected } from '../../lib/altitude';
import { steeringHeading } from '../../lib/autopilot';
import { blockHeight, DB_FONT_PX, DB_LINE, DB_WIDTH, leader, leaderTip } from '../../lib/datablock';
import { climbArrow, emergencyCode, formatGsWake, padBearing } from '../../lib/format';
import type { Track } from '../../state/track';
import type { Anchor, LineBatch, TextBatch } from './pack';
import { THEME, trackLabel, typeLabel } from './rules';

const DATA_BLOCK_PERIOD_SEC = 8;

/** The tone of a stretch of block text: the block's own, the dimmed one of downlinked intent, or an alert. */
export type Tone = 'plain' | 'intent' | 'alert';

/** A stretch of block text in one tone. */
export interface Run {
  text: string;
  tone: Tone;
}

export interface DataBlock {
  /** The line above the identity: the emergency, an advisory and the ident, when any. */
  tags: Run[];
  line1: string;
  line2: Run[];
  /** Selected heading, all intent; null when there is none to show. */
  line3: string | null;
}

const plain = (text: string): Run => ({ text, tone: 'plain' });
const intent = (text: string): Run => ({ text, tone: 'intent' });
const alert = (text: string): Run => ({ text, tone: 'alert' });

/**
 * The tags above the block in order of precedence: the emergency, then an active advisory,
 * then the ident; alerts but the last.
 */
function tagsOf(t: Track): Run[] {
  const code = emergencyCode(t.squawk, t.emergency);
  const tags = [
    ...(code ? [alert(code)] : []),
    ...(t.ra && !t.ra.terminated ? [alert('RA')] : []),
    ...(t.ident ? [plain('ID')] : []),
  ];
  return tags.flatMap((tag, i) => (i === 0 ? [tag] : [plain(' '), tag]));
}

/** Data block lines beyond the standard two. */
export function extraLines(t: Track): number {
  return (tagsOf(t).length > 0 ? 1 : 0) + (headingLine(t) === null ? 0 : 1);
}

/** Lines of a built block beyond the standard two; always `extraLines` of its track. */
export function blockExtraLines(block: DataBlock): number {
  return (block.tags.length > 0 ? 1 : 0) + (block.line3 === null ? 0 : 1);
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
    tags: tagsOf(t),
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
function drawRuns(text: TextBatch, runs: Run[], at: Anchor, colors: Record<Tone, string>): void {
  let px = at.px ?? 0;
  for (const r of runs) {
    text.text(r.text, { ...at, px }, DB_FONT_PX, colors[r.tone]);
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
  const colors = { plain: color, intent: dim(color, INTENT_TONE), alert: THEME.emergency };
  const top = block.tags.length > 0 ? 1 : 0;
  if (top) drawRuns(text, block.tags, anchor(block.tags.map((r) => r.text).join(''), 0), colors);
  text.text(block.line1, anchor(block.line1, top), DB_FONT_PX, color);
  drawRuns(text, block.line2, anchor(block.line2.map((r) => r.text).join(''), top + 1), colors);
  if (block.line3) text.text(block.line3, anchor(block.line3, top + 2), DB_FONT_PX, colors.intent);
}
