import { climbState } from '../../lib/format';
import type { ReadingKey } from '../../state/plotted';
import type { Sample } from '../../state/track';
import { NONE, READINGS } from '../readings';
import { plotText } from './plot';
import { PLOTS } from './plots';

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

/** An intent as a lane's readout prints it. */
export interface IntentText {
  key: ReadingKey;
  text: string;
}

/**
 * What a lane reads at a sample: its own reading, then the intent plotted in it that the aircraft
 * goes for first, and the other one, if two are.
 */
export interface LaneReadout {
  value: string;
  first?: IntentText;
  other?: IntentText;
}

/** A reading of the sample as a lane prints it; undefined when unknown. */
function textOf(key: ReadingKey, s: Sample): string | undefined {
  const r = READINGS[key].format(s);
  return r === NONE ? undefined : plotText(key, r);
}

/** The intents plotted in a lane, the one the aircraft goes for first leading: by altitude in the altitude lane. */
function intentsOf(keys: readonly ReadingKey[], s: Sample): ReadingKey[] {
  const [lane, ...intents] = keys;
  if (lane !== 'alt') return intents;
  const alt = PLOTS.alt;
  const targets = altTargets(
    alt.kind === 'line' ? alt.y(s) : undefined,
    s.verticalRate,
    intents.includes('selAlt') ? s.selAlt : undefined,
    intents.includes('fmsAlt') ? s.fmsAlt : undefined,
  );
  return targets ? [targets.first.key, ...(targets.other ? [targets.other.key] : [])] : [];
}

/** What the lane of `keys`, its own reading then the intents drawn in it, reads at `s`. */
export function readoutOf(keys: readonly ReadingKey[], s: Sample): LaneReadout {
  const [lane] = keys;
  const value = (lane && textOf(lane, s)) ?? NONE.v;
  const [first, other] = intentsOf(keys, s).flatMap((key) => {
    const text = textOf(key, s);
    return text === undefined ? [] : [{ key, text }];
  });
  return { value, ...(first && { first }), ...(other && { other }) };
}
