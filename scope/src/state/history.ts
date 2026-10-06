import { createSignal } from 'solid-js';

import { closeLane, DEFAULT_PLOTTED, moveLane, type ReadingKey, togglePlotted } from './plotted';
import { persisted } from './settings';

/** The readings the history lanes plot, in lane order; see `plotted.ts` for what that means. */
export const [plotted, setPlotted] = createSignal<readonly ReadingKey[]>(persisted.plotted);

export function togglePlot(key: ReadingKey): void {
  setPlotted((p) => togglePlotted(p, key));
}

export function closePlotLane(lane: ReadingKey): void {
  setPlotted((p) => closeLane(p, lane));
}

export function movePlotLane(from: number, to: number): void {
  setPlotted((p) => moveLane(p, from, to));
}

export function resetPlotted(): void {
  setPlotted(DEFAULT_PLOTTED);
}

/** The sample time under the pointer on the lanes, which the scope rings on the trail; null off them. */
export const [hoverInstant, setHoverInstant] = createSignal<number | null>(null);
