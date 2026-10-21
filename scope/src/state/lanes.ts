import { createSignal } from 'solid-js';

import { addLane, type LaneKey, moveLane, removeLane, switchLane } from './plotted';
import { persisted } from './settings';
import { DEFAULT_WINDOW, type LanesWindow } from './window';

/** The lanes of the detail column, in order. */
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

/** What the column shows of one target: its window, and how far down its lanes are scrolled. */
interface LanesView {
  hex: string | null;
  window: LanesWindow;
  scrollTop: number;
}

const [view, setView] = createSignal<LanesView>({
  hex: null,
  window: DEFAULT_WINDOW,
  scrollTop: 0,
});

const viewOf = (v: LanesView, hex: string | null): LanesView =>
  v.hex === hex ? v : { hex, window: DEFAULT_WINDOW, scrollTop: 0 };

/** The column's view of `hex`; any target but the one kept starts on the default window and at the top. */
export const lanesView = (hex: string | null): LanesView => viewOf(view(), hex);

export function setLanesWindow(hex: string | null, next: LanesWindow): void {
  setView((v) => ({ ...viewOf(v, hex), window: next }));
}

export function setLaneScroll(hex: string | null, scrollTop: number): void {
  setView((v) => ({ ...viewOf(v, hex), scrollTop }));
}

/** Drops the kept view unless it is of `hex`, the target now selected. */
export function keepViewOf(hex: string | null): void {
  setView((v) => viewOf(v, hex));
}

/** The time of the sample under the pointer on the lanes, which the scope rings on the trail; null off them and over a gap. */
export const [hoverInstant, setHoverInstant] = createSignal<number | null>(null);

/** The instant the cursor stands at on the lanes: the sample's, or the pointer's over a gap; null off them. */
export const [cursorInstant, setCursorInstant] = createSignal<number | null>(null);
