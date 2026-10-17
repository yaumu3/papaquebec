import { climbState } from '../../lib/format';

/**
 * Within this, the two targets agree: the coarser step a selected altitude comes in, 32 ft in the
 * Target State and Status message (RTCA DO-260B), against 16 ft in Comm-B register 4,0.
 */
const AGREE_FT = 32;

/** An altitude target, in feet as the crew set it. */
export interface Target {
  key: 'selAlt' | 'fmsAlt';
  ft: number;
}

/** The altitude targets, the one the aircraft levels at first leading. */
export interface Targets {
  first: Target;
  other?: Target;
}

/**
 * The altitude targets in the order the aircraft levels at them: the lower first in a climb, the
 * higher first in a descent, and when level the one nearer its altitude, the selected one on a
 * tie or with the altitude unknown. One when they agree or only one is known; null without either.
 */
export function altTargets(
  altFt: number | undefined,
  verticalRate: number | undefined,
  sel: number | undefined,
  fms: number | undefined,
): Targets | null {
  const s: Target | undefined = sel === undefined ? undefined : { key: 'selAlt', ft: sel };
  const f: Target | undefined = fms === undefined ? undefined : { key: 'fmsAlt', ft: fms };
  if (!s || !f) {
    const one = s ?? f;
    return one ? { first: one } : null;
  }
  if (Math.abs(s.ft - f.ft) < AGREE_FT) return { first: s };
  return fmsFirst(altFt, verticalRate, s.ft, f.ft)
    ? { first: f, other: s }
    : { first: s, other: f };
}

/** Whether the aircraft levels at the FMS altitude before the selected one. */
function fmsFirst(
  altFt: number | undefined,
  verticalRate: number | undefined,
  sel: number,
  fms: number,
): boolean {
  switch (climbState(verticalRate)) {
    case 'climbing':
      return fms < sel;
    case 'descending':
      return fms > sel;
    default:
      return altFt !== undefined && Math.abs(fms - altFt) < Math.abs(sel - altFt);
  }
}
