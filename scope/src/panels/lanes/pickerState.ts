import { createEffect, createSignal, on } from 'solid-js';

import {
  addPlotLane,
  movePlotLane,
  plotted,
  removePlotLane,
  switchPlotLane,
} from '../../state/lanes';
import { laneAfter, type LaneKey } from '../../state/plotted';
import { pickOf } from './chips';
import type { LaneMoves } from './moves';
import {
  addPickerAnchor,
  clickSourceOf,
  contextSourceOf,
  lanePickerAnchor,
  type PickerAnchor,
} from './pickerPlace';

/** Applies a pick of `lane` in the picker of `own`: it takes the place of `own`, joins the column, or is open already. */
function take(own: LaneKey | null, lane: LaneKey): void {
  const what = pickOf(plotted(), own, lane);
  if (what === 'switch' && own) switchPlotLane(own, lane);
  else if (what === 'add') addPlotLane(lane);
}

/**
 * The picker open over the column, if one is, and what opens, closes and answers it. `lanes` holds
 * each lane's element and `add` the + LANE button, which keep the focus for the picker.
 */
export function createPickerState(deps: {
  hex: () => string;
  lanes: ReadonlyMap<LaneKey, HTMLElement>;
  add: () => HTMLButtonElement | undefined;
}) {
  /** The picker open, if one is: for a lane, or with none to add one; under its anchor. */
  const [picker, setPicker] = createSignal<{
    own: LaneKey | null;
    anchor: HTMLElement;
    at: PickerAnchor;
  } | null>(null);
  const closePicker = () => setPicker(null);
  createEffect(on(deps.hex, closePicker, { defer: true }));
  /** What the last press on the column was made with: a finger's long press ends in a `contextmenu`. */
  let pressed: string | null = null;
  /** Opens a lane's picker where it was asked for, or leaves it to the hold when a finger asked. */
  const openLanePicker = (own: LaneKey, e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    const lane = e.currentTarget;
    if (!(lane instanceof HTMLElement)) return;
    const source = e instanceof MouseEvent ? contextSourceOf(e.button, pressed) : 'keyboard';
    const point = e instanceof MouseEvent ? { x: e.clientX, y: e.clientY } : { x: 0, y: 0 };
    const anchor = lanePickerAnchor(source, point.x, point.y, lane.getBoundingClientRect());
    if (anchor) setPicker({ own, anchor: lane, at: anchor });
  };
  /** Opens the picker that adds a lane, upward from the click or from the button's corner. */
  const openAdd = (e: MouseEvent) => {
    const button = e.currentTarget;
    if (!(button instanceof HTMLElement)) return;
    const source = clickSourceOf(e.detail);
    const at = addPickerAnchor(source, e.clientX, e.clientY, button.getBoundingClientRect());
    setPicker({ own: null, anchor: button, at });
  };
  /** Brings a lane into view and gives it the focus; with none, + LANE. */
  const reveal = (lane: LaneKey | null) => {
    const el = (lane && deps.lanes.get(lane)) || deps.add();
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    el.focus({ preventScroll: true });
  };
  const pick = (lane: LaneKey) => {
    const m = picker();
    if (!m) return;
    closePicker();
    take(m.own, lane);
    reveal(lane);
  };
  /** The LANE row of the picker of `own`. */
  const movesOf = (own: LaneKey): LaneMoves => {
    const i = () => plotted().indexOf(own);
    const move = (to: number) => {
      closePicker();
      movePlotLane(i(), to);
      reveal(own);
    };
    return {
      first: i() === 0,
      last: i() === plotted().length - 1,
      onUp: () => move(i() - 1),
      onDown: () => move(i() + 1),
      onRemove: () => {
        const next = laneAfter(plotted(), own);
        closePicker();
        removePlotLane(own);
        reveal(next);
      },
    };
  };
  return {
    picker,
    closePicker,
    /** Notes what a press on the column was made with, for the `contextmenu` that may follow. */
    press: (pointerType: string) => {
      pressed = pointerType;
    },
    openLanePicker,
    openAdd,
    /** Opens a lane's picker at a finger, which a long press has lifted the lane for. */
    openAt: (lane: LaneKey, el: HTMLElement, x: number, y: number) =>
      setPicker({ own: lane, anchor: el, at: { x, y, up: false } }),
    reveal,
    pick,
    movesOf,
  };
}
