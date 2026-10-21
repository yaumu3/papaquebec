import { ALTITUDE_THOUSAND_FT } from './geometry';

/**
 * A digit wheel of a readout: its rows top to bottom, and how far it has turned toward the row
 * above the one at rest.
 */
export interface Wheel<T = string> {
  rows: readonly T[];
  /** From 0, at rest, up to but not including 1, the next row fully in. */
  turned: number;
}

/**
 * The fraction of its last `step` before the next multiple of `place` that `a` has run: how far a
 * carry wheel has turned.
 */
const carried = (a: number, place: number, step: number): number =>
  Math.max(0, (a % place) - (place - step)) / step;

/**
 * A digit wheel of `place`, rolling from this digit to the next through the last `step` before it.
 */
const carryWheel = <T>(a: number, place: number, step: number, rows: [T, T]): Wheel<T> => ({
  rows,
  turned: carried(a, place, step),
});

export interface SpeedDigits {
  hundreds: Wheel;
  tens: Wheel;
  /** The ones, rows base + 2 down to base − 1 kt. */
  ones: Wheel;
}

const TEN_KT = 10;
const HUNDRED_KT = 100;

const oneDigit = (n: number): string => String(((n % 10) + 10) % 10);

/** The speed as wheels: each digit rolls through the last knot before it changes. */
export function speedDigits(ias: number): SpeedDigits {
  const base = Math.floor(ias);
  const hundreds = Math.floor(ias / HUNDRED_KT);
  const tens = Math.floor(ias / TEN_KT);
  return {
    hundreds: carryWheel(ias, HUNDRED_KT, 1, [
      String(hundreds + 1),
      hundreds === 0 ? '' : String(hundreds),
    ]),
    tens: carryWheel(ias, TEN_KT, 1, [oneDigit(tens + 1), oneDigit(tens)]),
    ones: {
      rows: [2, 1, 0, -1].map((k) => (base + k < 0 ? '' : oneDigit(base + k))),
      turned: ias - base,
    },
  };
}

/** What the slot of the ten-thousands shows: a digit, a hatch below 10,000 ft, NEG below zero. */
export type SlotRow = { kind: 'digit'; text: string } | { kind: 'hatch' } | { kind: 'neg' };

export interface AltitudeDigits {
  tenThousands: Wheel<SlotRow>;
  thousands: Wheel;
  hundreds: Wheel;
  /** The last two digits, rows base + 40 down to base − 20 ft. */
  drum: Wheel;
}

const DRUM_STEP_FT = 20;
const HUNDRED_FT = 100;
const TEN_THOUSAND_FT = 10000;

/** The last two digits of a non-negative number. */
const twoDigits = (n: number): string => String(n % 100).padStart(2, '0');

const slotDigit = (n: number): SlotRow => ({ kind: 'digit', text: String(n) });

/** The slot's row at rest: NEG below zero, a hatch under 10,000 ft, else the ten-thousands digit. */
function slotRow(ft: number): SlotRow {
  if (ft < 0) return { kind: 'neg' };
  return ft < TEN_THOUSAND_FT ? { kind: 'hatch' } : slotDigit(Math.floor(ft / TEN_THOUSAND_FT));
}

const digitAt = (a: number, place: number, next = 0): string =>
  String((Math.floor(a / place) + next) % 10);

/**
 * The digits of an altitude as wheels, the absolute value laid out as usual after a sign. Each
 * digit rolls through the last 20 ft before it changes, and the drum stands at the exact place
 * within its 20 ft step.
 */
export function altitudeDigits(ft: number): AltitudeDigits {
  const a = Math.abs(ft);
  const base = Math.floor(a / DRUM_STEP_FT) * DRUM_STEP_FT;
  return {
    tenThousands: carryWheel(a, TEN_THOUSAND_FT, DRUM_STEP_FT, [
      slotDigit(Math.floor(a / TEN_THOUSAND_FT) + 1),
      slotRow(ft),
    ]),
    thousands: carryWheel(a, ALTITUDE_THOUSAND_FT, DRUM_STEP_FT, [
      digitAt(a, ALTITUDE_THOUSAND_FT, 1),
      digitAt(a, ALTITUDE_THOUSAND_FT),
    ]),
    hundreds: carryWheel(a, HUNDRED_FT, DRUM_STEP_FT, [
      digitAt(a, HUNDRED_FT, 1),
      digitAt(a, HUNDRED_FT),
    ]),
    drum: {
      rows: [2, 1, 0, -1].map((k) => twoDigits(Math.abs(base + k * DRUM_STEP_FT))),
      turned: (a - base) / DRUM_STEP_FT,
    },
  };
}
