import { createSignal } from 'solid-js';

import { type NdRangeNm, persisted } from './settings';

/** The range of the ND, one for all targets. */
export const [ndRangeNm, setNdRangeNm] = createSignal<NdRangeNm>(persisted.ndRangeNm);
