import { createSignal } from 'solid-js';

import { addLane, type LaneKey, moveLane, removeLane, switchLane } from './plotted';
import { persisted } from './settings';

/** The lanes of the history, in order. */
export const [plotted, setPlotted] = createSignal<readonly LaneKey[]>(persisted.plotted);

export function removePlotLane(lane: LaneKey): void {
  setPlotted((p) => removeLane(p, lane));
}

export function movePlotLane(from: number, to: number): void {
  setPlotted((p) => moveLane(p, from, to));
}

export function switchPlotLane(from: LaneKey, to: LaneKey): void {
  setPlotted((p) => switchLane(p, from, to));
}

export function addPlotLane(lane: LaneKey): void {
  setPlotted((p) => addLane(p, lane));
}

/** Whether the history group is unfolded in the detail panel. */
export const [historyOpen, setHistoryOpen] = createSignal(persisted.historyOpen);

export function toggleHistory(): void {
  setHistoryOpen((open) => !open);
}

/** The sample time under the pointer on the lanes, which the scope rings on the trail; null off them. */
export const [hoverInstant, setHoverInstant] = createSignal<number | null>(null);
