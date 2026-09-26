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
import { isEmergency, trackLabel } from './rules';

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
