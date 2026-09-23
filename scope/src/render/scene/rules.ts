import { PALETTE } from '../../design/palette';
import { type Altimeter, formatAltitude, STANDARD_ALTIMETER } from '../../lib/altitude';
import { climbArrow, climbState, emergencyCode, formatGsWake } from '../../lib/format';
import type { Visibility } from '../../state/filter';
import type { Track } from '../../state/track';
import { Shape } from '../protocol';

/** The scope's palette. Color encodes state; nothing here is decorative. */
export const THEME = {
  bg: PALETTE.bg,
  coast: '#707070',
  airspace: '#a04040',
  airway: '#3a6a78',
  airwayLabel: '#4a8090',
  waypoint: '#707070',
  waypointLabel: '#7a7a7a',
  navaid: '#808080',
  navaidLabel: '#909090',
  airport: '#8a8a8a',
  airportLabel: '#a0a0a0',
  airspaceDim: '#5e3a3a',
  airspaceLabel: '#8a5050',
  sector: '#4a6878',
  ring: '#3a3a3a',
  ringEdge: '#606060',
  ringLabel: '#555555',
  level: PALETTE.level,
  climb: PALETTE.climb,
  descend: PALETTE.descend,
  stale: PALETTE.stale,
  selected: PALETTE.selected,
  selbox: PALETTE.selbox,
  emergency: PALETTE.emergency,
  history: '#ffa050',
  cursor: '#d48cf0',
  cursorDim: '#9a6ab0',
  filtered: '#808080',
  hover: '#a0a0a0',
} as const;

/** Control zones and special-use areas: what the operator must not miss. Everything else is context. */
const BRIGHT_AIRSPACE = new Set(['CTR', 'ATZ', 'TIZ', 'TIA', 'R', 'D', 'P', 'ALERT', 'WARNING']);

export function airspaceColor(kind: string | undefined): string {
  return kind !== undefined && BRIGHT_AIRSPACE.has(kind) ? THEME.airspace : THEME.airspaceDim;
}

const STALE_SECONDS = 30;
const DATA_BLOCK_PERIOD_SEC = 8;

export function isStale(t: Track): boolean {
  return t.position.kind === 'last' || (t.seenPos ?? 0) > STALE_SECONDS;
}

export function isEmergency(t: Track): boolean {
  return emergencyCode(t.squawk, t.emergency) !== null;
}

/** Emergency over selected over stale over climb state. */
export function trackColor(t: Track, selected: string | null): string {
  if (isEmergency(t)) return THEME.emergency;
  if (t.hex === selected) return THEME.selected;
  if (isStale(t)) return THEME.stale;
  switch (climbState(t.baroRate)) {
    case 'climbing':
      return THEME.climb;
    case 'descending':
      return THEME.descend;
    default:
      return THEME.level;
  }
}

/** Shape encodes source; a filtered target is reduced to a hollow diamond. */
export function targetShape(t: Track, visibility: Visibility): Shape {
  if (visibility === 'filtered') return Shape.HollowDiamond;
  switch (t.source) {
    case 'mlat':
      return Shape.SquareRing;
    case 'tisb':
      return Shape.Diamond;
    default:
      return Shape.Square;
  }
}

export interface DataBlock {
  prefix: 'HJ' | 'RF' | 'EM' | null;
  line1: string;
  line2: string;
}

/** Callsign, else registration, else the hex: the most operator-meaningful identity known. */
export function trackLabel(t: Track): string {
  return t.flight ?? t.registration ?? t.hex.toUpperCase();
}

/**
 * Two lines: identity, then altitude with climb arrow and either the type
 * or ground speed with wake, alternating every 8 s on one shared clock so
 * every block reads the same field at the same time.
 */
export function dataBlock(
  t: Track,
  nowSec: number,
  altimeter: Altimeter = STANDARD_ALTIMETER,
): DataBlock {
  const showType = Math.floor(nowSec / DATA_BLOCK_PERIOD_SEC) % 2 === 0;
  const alt = formatAltitude(t.alt, altimeter);
  const typeLabel = t.type ?? `[${t.category ?? '--'}]`;
  const second = showType ? typeLabel : formatGsWake(t.gs, t.category);
  return {
    prefix: emergencyCode(t.squawk, t.emergency),
    line1: trackLabel(t),
    line2: `${alt}${climbArrow(t.baroRate)} ${second}`,
  };
}
