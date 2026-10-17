import { climbState } from '../../lib/format';
import type { ReadingKey } from '../../state/plotted';
import type { Sample } from '../../state/track';
import { NONE, READINGS } from '../readings';
import { headingHeardNear, plotText } from './plot';
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
 * goes for first, and the other one, if two are; or whether the two agree, so that one reads for both.
 */
export interface LaneReadout {
  value: string;
  first?: IntentText;
  other?: IntentText;
  agreed?: true;
}

/** A reading of the sample as a lane prints it; undefined when unknown. */
function textOf(key: ReadingKey, s: Sample): string | undefined {
  const r = READINGS[key].format(s);
  return r === NONE ? undefined : plotText(key, r);
}

/**
 * The intents plotted in a lane, the one the aircraft goes for first leading: by altitude in the
 * altitude lane, where two that agree read as one.
 */
function intentsOf(
  keys: readonly ReadingKey[],
  s: Sample,
): { keys: ReadingKey[]; agreed: boolean } {
  const [lane, ...intents] = keys;
  if (lane !== 'alt') return { keys: intents, agreed: false };
  const alt = PLOTS.alt;
  const sel = intents.includes('selAlt') ? s.selAlt : undefined;
  const fms = intents.includes('fmsAlt') ? s.fmsAlt : undefined;
  const targets = altTargets(alt.kind === 'line' ? alt.y(s) : undefined, s.verticalRate, sel, fms);
  if (!targets) return { keys: [], agreed: false };
  const { first, other } = targets;
  return {
    keys: [first.key, ...(other ? [other.key] : [])],
    agreed: !other && sel !== undefined && fms !== undefined,
  };
}

/** What the lane of `keys`, its own reading then the intents drawn in it, reads at the sample `at`. */
export function readoutOf(keys: readonly ReadingKey[], at: Sample): LaneReadout {
  const [lane] = keys;
  // As the glyphs draw them: a track, heading or selection heard a gap ago is unknown.
  const s = lane === 'trk' ? headingHeardNear(at, at.t) : at;
  const value = (lane && textOf(lane, s)) ?? NONE.v;
  const intents = intentsOf(keys, s);
  const [first, other] = intents.keys.flatMap((key) => {
    const text = textOf(key, s);
    return text === undefined ? [] : [{ key, text }];
  });
  return {
    value,
    ...(first && { first }),
    ...(other && { other }),
    ...(intents.agreed && { agreed: true as const }),
  };
}

/** Whether an intent has a value at a sample, as the lane plots it. */
function hasValue(key: ReadingKey, s: Sample): boolean {
  const spec = PLOTS[key];
  return spec.kind === 'intent' && spec.y(s) !== undefined;
}

/** The intents plotted in the lane of `keys` that the contact ever had a value of, in their order. */
export function heldIntents(keys: readonly ReadingKey[], samples: readonly Sample[]): ReadingKey[] {
  return keys.slice(1).filter((key) => samples.some((s) => hasValue(key, s)));
}

/**
 * A slot of a lane's readout: an intent's text; none, for one unknown at the instant; or blank,
 * for one that agrees with the other.
 */
export interface Slot {
  key: ReadingKey;
  text?: string;
  blank?: true;
}

/**
 * The readout's slots, one per intent the contact had: the one the aircraft goes for first, then
 * the other; an intent without a value at the instant takes the slot the order leaves it.
 */
export function readoutSlots(r: LaneReadout, held: readonly ReadingKey[]): Slot[] {
  const [one, two] = held;
  if (one === undefined) return [];
  const first: Slot = r.first ?? { key: one };
  if (two === undefined) return [first];
  const rest = held.find((key) => key !== first.key) ?? two;
  const second: Slot = r.other ?? (r.agreed ? { key: rest, blank: true } : { key: rest });
  return [first, second];
}
