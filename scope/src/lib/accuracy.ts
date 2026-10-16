/** What the navigation accuracy categories of ADS-B bound. */

/**
 * The estimated position uncertainty each Navigation Accuracy Category for position stands for,
 * in metres (RTCA DO-260B §2.2.3.2.7.2.7): the 95 % bound on the horizontal position error. From
 * NACp 8 down the bounds are 0.05, 0.1, 0.3, 0.5, 1, 2, 4 and 10 NM.
 */
const EPU_M: Readonly<Record<number, number>> = {
  11: 3,
  10: 10,
  9: 30,
  8: 92.6,
  7: 185.2,
  6: 555.6,
  5: 926,
  4: 1852,
  3: 3704,
  2: 7408,
  1: 18520,
};

/** The EPU bound of a NACp category in metres; none for NACp 0, which bounds nothing. */
export function epuM(nacP: number): number | undefined {
  return EPU_M[nacP];
}
