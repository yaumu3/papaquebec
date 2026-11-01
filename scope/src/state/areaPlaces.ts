import { createMemo, createRoot } from 'solid-js';

import type { ChartItem } from '../lib/chart';
import { type AreaPlace, areaPlaceOf } from '../lib/pole';
import { topology } from './mapsets';
import { projectionVersion } from './scope';
import { projectNm } from './tracks';

/**
 * Where each area item's label goes. A place is found the first time an item asks for it and
 * kept until the chart or the projection changes, never renewed by a zoom or a pan.
 */
export const areaPlace = createRoot(() => {
  const places = createMemo(() => {
    topology();
    projectionVersion();
    return new Map<string, AreaPlace | undefined>();
  });
  return (item: ChartItem): AreaPlace | undefined => {
    const known = places();
    if (!known.has(item.key)) known.set(item.key, areaPlaceOf(item, projectNm));
    return known.get(item.key);
  };
});
