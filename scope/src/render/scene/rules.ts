import { PALETTE } from '../../design/palette';
import { climbState, emergencyCode } from '../../lib/format';
import { LAPSE_SEC } from '../../lib/reports';
import type { Readings, Track } from '../../state/track';
import { Shape } from '../protocol';

/** The scope's palette. Color encodes state; nothing here is decorative. */
export const THEME = {
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

/** Whether the position is as old as the lapse, or older. */
export function isStale(t: Pick<Readings, 'seenPos'>): boolean {
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

/** Shape encodes source. */
export function targetShape(t: Track): Shape {
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
