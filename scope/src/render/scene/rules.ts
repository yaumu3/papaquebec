import { PALETTE } from '../../design/palette';
import { climbState, emergencyCode } from '../../lib/format';
import { LAPSE_SEC } from '../../lib/reports';
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
  ground: PALETTE.ground,
  selected: PALETTE.selected,
  selbox: PALETTE.selbox,
  emergency: PALETTE.emergency,
  caution: PALETTE.caution,
  ident: '#ffffff',
  history: '#ffa050',
  cursor: '#d48cf0',
  cursorDim: '#9a6ab0',
  cursorFaint: '#d48cf04d',
  filtered: '#808080',
  hover: PALETTE.hover,
} as const;

/** Control zones and special-use areas: what the operator must not miss. Everything else is context. */
const BRIGHT_AIRSPACE = new Set(['CTR', 'ATZ', 'TIZ', 'TIA', 'R', 'D', 'P', 'ALERT', 'WARNING']);

export function airspaceColor(kind: string | undefined): string {
  return kind !== undefined && BRIGHT_AIRSPACE.has(kind) ? THEME.airspace : THEME.airspaceDim;
}

/** Whether the position is as old as the lapse, or older. */
export function isStale(t: Track): boolean {
  return (t.seenPos ?? 0) >= LAPSE_SEC;
}

export function isEmergency(t: Track): boolean {
  return emergencyCode(t.squawk, t.emergency) !== null;
}

/** Emergency over selected over stale over ground over climb state. */
export function trackColor(t: Track, selected: string | null): string {
  if (isEmergency(t)) return THEME.emergency;
  if (t.hex === selected) return THEME.selected;
  if (isStale(t)) return THEME.stale;
  if (t.alt === 'ground') return THEME.ground;
  switch (climbState(t.verticalRate)) {
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

/** Callsign, else registration, else the hex: the most operator-meaningful identity known. */
export function trackLabel(t: Track): string {
  return t.flight ?? t.registration ?? t.hex.toUpperCase();
}

/** The type designator, else the emitter category in brackets. */
export function typeLabel(t: Track): string {
  return t.type ?? `[${t.category ?? '--'}]`;
}
