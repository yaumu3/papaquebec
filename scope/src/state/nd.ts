import { createSignal } from 'solid-js';

import { ND_RANGES_NM, type NdRangeNm, persisted } from './settings';

/** The range of the ND, one for all targets. */
export const [ndRangeNm, setNdRangeNm] = createSignal<NdRangeNm>(persisted.ndRangeNm);

/** The range a step of the scale away: +1 out to a larger one, -1 in to a smaller; none past either end. */
export function ndRangeAfter(range: NdRangeNm, step: 1 | -1): NdRangeNm | undefined {
  return ND_RANGES_NM[ND_RANGES_NM.indexOf(range) + step];
}
