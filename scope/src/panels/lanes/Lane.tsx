import { type Accessor, createMemo, Index, Show } from 'solid-js';

import { cx } from '../../design/cx';
import type { HistoryLane, ReadingKey } from '../../state/plotted';
import type { Sample } from '../../state/track';
import { type Interval, type WindowKey, xOf } from '../../state/window';
import { LANE_LABELS, NONE } from '../readings';
import { fixed } from '../svg';
import { clearOfEnds, clockStep, ticks } from './axis';
import { laneName } from './chips';
import { CursorChip } from './CursorChip';
import type { LanePart } from './laneDrag';
import { isMenuKey } from './menu';
import { type LaneMoves, onMoveKey, windowKeyOf } from './moves';
import {
  atTicks,
  barbPath,
  barbReach,
  GLYPH_REACH_PX,
  headingAt,
  headingGlyph,
  laneRange,
  type LaneTrace,
  laneTraces,
  pathOf,
  scaleLabels,
} from './plot';
import { type Dash, HEARD, PLOTS } from './plots';
import { heldIntents, type LaneReadout, readoutOf, readoutSlots, type Slot } from './readout';
import { barsOf, gapsIn, yOf } from './trace';

import s from './Lanes.module.css';

/** The data band: below the lane's top row, where its name sits, and clear of its foot. */
const PAD_TOP_PX = 28;
const PAD_BOTTOM_PX = 11;
/** How far the grid lines and the gaps stop short of the lane's top and bottom. */
const GRID_INSET_PX = 4;
/** Kept clear above and below a gantt bar, within its row. */
const BAR_INSET_PX = 2;
/** A row thinner than this cannot hold its tab's text, and tabs would run into each other. */
const TAB_MIN_PX = 11;
const BARB_PX = 16;
/** How far apart barbs stand at the least, on round clock times of their own. */
const BARB_PITCH_PX = 32;
/** The same for heading glyphs, which are wider: about 30 px across at the most. */
const GLYPH_PITCH_PX = 36;

/** The sample of the second slot's line in the readout. */
const SAMPLE_PX = 12;
const SAMPLE_H_PX = 8;

/** What a readout slot reads: its intent, or the blank of the unknown. */
const slotText = (slot: Slot): string => slot.text ?? NONE.v;
/** Whether a readout slot holds an intent unknown at the instant. */
const unknown = (slot: Slot): boolean => slot.text === undefined;

/** The class that dashes a trace, if any. */
const dashClass = (dash: Dash | undefined): string | undefined => dash && s[dash];

/** The dash an intent is drawn with, if any. */
const dashOf = (key: ReadingKey): Dash | undefined => {
  const p = PLOTS[key];
  return p.kind === 'intent' ? p.dash : undefined;
};

/** One lane of the bay: a top row with its name and readout, then its scale and its plot over the window. */
export function Lane(props: {
  lane: HistoryLane;
  /** Its place among the lanes, and how many there are. */
  index: number;
  count: number;
  /** The lane's own reading, then the intents drawn in it. */
  keys: readonly ReadingKey[];
  samples: readonly Sample[];
  visible: Interval;
  ticks: readonly number[];
  width: number;
  height: number;
  /** The sample the lane is read at, and whether that is off now: peeking, or the window held. */
  at: Sample | null;
  past: boolean;
  /** Where the time cursor stands across the plot, if it does. */
  cursor: number | null;
  /** The span being selected, between two points across the plot, if one is. */
  band: { from: number; to: number } | null;
  /** Resets the window, as a double click on the lane does. */
  onReset: () => void;
  /** Pans, narrows, widens or resets the window, as a key on the lane asks. */
  onWindowKey: (key: WindowKey) => void;
  /** The lane itself, which keeps the focus for it. */
  laneRef: (el: HTMLDivElement) => void;
  moves: LaneMoves;
  /** What asks for the lane's palette. */
  onMenu: (e: MouseEvent | KeyboardEvent) => void;
  onGrab: (e: PointerEvent, part: LanePart) => void;
  /** Where it stands among the lanes while one is dragged, and whether it is that one, shown as its slot. */
  place: number;
  /** How far a finger has swiped the top row left, while one does. */
  swipeX: number | null;
  slot: boolean;
  /** Whether a finger has lifted it and not moved it yet: lit where it stands. */
  lifted: boolean;
}) {
  const spec = PLOTS[props.lane];
  const label = LANE_LABELS[props.lane];
  const x = (t: number) => xOf(t, props.visible, props.width);

  const traces = createMemo(() => laneTraces(props.samples, props.keys, props.visible));
  const range = createMemo(() => laneRange(traces(), props.lane, props.visible));
  /** Where a trace's values fall: on the lane's scale, or all of them along its floor. */
  const yFor = (tr: LaneTrace) => (tr.floor ? () => props.height - PAD_BOTTOM_PX : y);
  /** Halfway down the data band. */
  const mid = () => (PAD_TOP_PX + props.height - PAD_BOTTOM_PX) / 2;
  const y = (v: number) => {
    const r = range();
    return r ? yOf(v, r, props.height, PAD_TOP_PX, PAD_BOTTOM_PX) : mid();
  };
  const scale = createMemo(() => {
    const r = range();
    return r ? scaleLabels(props.lane, r) : [];
  });
  /** A value line on a whole pixel row, so it reads one pixel thin. */
  const lineY = (v: number) => Math.floor(y(v)) + 0.5;
  const gaps = createMemo(() => gapsIn(props.samples, props.visible));
  const bars = createMemo(() =>
    spec.kind === 'gantt' ? barsOf(props.samples, spec.names, HEARD[props.lane]) : [],
  );
  const rowHeight = () => (props.height - PAD_TOP_PX - PAD_BOTTOM_PX) / Math.max(1, bars().length);
  /** The shortest round clock step that keeps glyphs at least `pitch` apart across the window. */
  const stepEvery = (pitch: number) =>
    clockStep(props.visible.to - props.visible.from, Math.max(1, Math.floor(props.width / pitch)));
  /** The ticks of `step` at which a mark reaching `reach` round each fits whole in the plot. */
  const ticksAt = (step: number, reach: number) =>
    clearOfEnds(ticks(props.visible, step), x, props.width, reach);
  const barbs = createMemo(() =>
    spec.kind === 'barbs'
      ? atTicks(
          props.samples,
          ticksAt(stepEvery(BARB_PITCH_PX), barbReach(BARB_PX)),
          spec.barb,
          undefined,
          HEARD[props.lane],
        )
      : [],
  );
  const glyphs = createMemo(() => {
    if (spec.kind !== 'heading') return [];
    // The intent plotted in the lane, if one is.
    const sel = props.keys.slice(1).find((key) => PLOTS[key].kind === 'intent');
    const read = (sample: Sample, t: number) => headingAt(sample, t, sel);
    // A tick takes a sample with a heading a little off it over the nearest without, so that
    // the aircraft does not come and go with the replies that carry its heading.
    const step = stepEvery(GLYPH_PITCH_PX);
    const has = (sample: Sample) => spec.heading(sample)?.hdg !== undefined;
    return atTicks(props.samples, ticksAt(step, GLYPH_REACH_PX), read, {
      has,
      withinSec: step / 2,
    }).map((h) => headingGlyph(x(h.t), mid(), h));
  });
  const readout = createMemo(() => (props.at ? readoutOf(props.keys, props.at) : null));
  /** The intents the contact had, over all of it, so that panning moves no slot. */
  const held = createMemo(() => heldIntents(props.keys, props.samples));
  const slots = () => {
    const r = readout();
    return r ? readoutSlots(r, held()) : [];
  };
  let top: HTMLDivElement | undefined;
  /** What the lane reads at the cursor, in its top row or, while a cursor stands, in the chip. */
  const readoutView = (r: Accessor<LaneReadout>) => (
    <div class={s.readout}>
      <span class={cx(r().unknown ? s.unknown : props.past && s.past)}>{r().value}</span>
      <Index each={slots()}>
        {(slot, i) => (
          <>
            <Show when={i === 1}>
              <svg class={s.sample} width={SAMPLE_PX} height={SAMPLE_H_PX}>
                <line
                  class={cx(
                    s.trace,
                    dashClass(dashOf(slot().key)),
                    s.intentDim,
                    unknown(slot()) && s.unknown,
                  )}
                  x1="0"
                  x2={SAMPLE_PX}
                  y1={SAMPLE_H_PX / 2}
                  y2={SAMPLE_H_PX / 2}
                />
              </svg>
            </Show>
            <span class={cx(i === 0 ? s.intentText : s.intentDim, unknown(slot()) && s.unknown)}>
              {slotText(slot())}
            </span>
          </>
        )}
      </Index>
    </div>
  );

  return (
    <div
      ref={props.laneRef}
      data-lane="history"
      class={cx(s.lane, props.slot && s.hole, props.lifted && s.lifted)}
      style={{ height: `${props.height}px`, order: props.place }}
      tabindex="0"
      role="group"
      aria-roledescription="lane"
      aria-label={laneName(props.lane, props.index, props.count)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const key = windowKeyOf(e);
        if (isMenuKey(e)) props.onMenu(e);
        else if (key) {
          e.preventDefault();
          e.stopPropagation();
          props.onWindowKey(key);
        } else onMoveKey(props.moves, e);
      }}
      onContextMenu={props.onMenu}
      onDblClick={props.onReset}
      onPointerDown={(e) =>
        props.onGrab(e, e.target instanceof Node && top?.contains(e.target) ? 'row' : 'plot')
      }
    >
      <div class={s.plot} data-plot>
        <svg class={s.svg} height={props.height}>
          <Index each={gaps()}>
            {(g) => (
              <rect
                class={s.gap}
                x={fixed(x(g().from))}
                y={GRID_INSET_PX}
                width={fixed(x(g().to) - x(g().from))}
                height={props.height - 2 * GRID_INSET_PX}
              />
            )}
          </Index>
          <path
            class={s.grid}
            d={props.ticks
              .map((t) => `M${fixed(x(t))} ${GRID_INSET_PX} V${props.height - GRID_INSET_PX}`)
              .join(' ')}
          />
          <path
            class={s.scale}
            d={scale()
              .map((l) => `M0 ${lineY(l.v)} H${props.width}`)
              .join(' ')}
          />
          <Index each={traces()}>
            {(tr) => (
              <path
                class={cx(s.trace, dashClass(tr().dash), tr().intent && s.intent)}
                d={pathOf(tr().runs, x, yFor(tr()))}
              />
            )}
          </Index>
          <Index each={barbs()}>
            {(b) => (
              <path class={s.barb} d={barbPath(x(b().t), mid(), b().dir, b().speed, BARB_PX)} />
            )}
          </Index>
          <Index each={glyphs()}>
            {(g) => (
              <>
                <Show when={g().vector}>{(d) => <path class={s.vector} d={d()} />}</Show>
                <Show when={g().aircraft}>{(d) => <path class={s.aircraft} d={d()} />}</Show>
                <Show when={g().arrow}>{(d) => <path class={s.arrow} d={d()} />}</Show>
                <Show when={g().toGo}>{(d) => <path class={s.toGo} d={d()} />}</Show>
                <Show when={g().tick}>{(d) => <path class={s.tick} d={d()} />}</Show>
                <Show when={g().held}>
                  {(at) => <circle class={s.held} cx={at().cx} cy={at().cy} r={at().r} />}
                </Show>
              </>
            )}
          </Index>
          <Index each={bars()}>
            {(bar, row) => (
              <Index each={bar().on}>
                {(on) => (
                  <rect
                    class={s.bar}
                    x={fixed(x(on().from))}
                    y={fixed(PAD_TOP_PX + row * rowHeight() + BAR_INSET_PX)}
                    width={fixed(Math.max(1, x(on().to) - x(on().from)))}
                    height={fixed(Math.max(2, rowHeight() - 2 * BAR_INSET_PX))}
                  />
                )}
              </Index>
            )}
          </Index>
        </svg>
        <Show when={rowHeight() >= TAB_MIN_PX}>
          <Index each={bars()}>
            {(bar, row) => (
              <span
                class={s.tab}
                style={{
                  top: `${PAD_TOP_PX + row * rowHeight()}px`,
                  height: `${rowHeight()}px`,
                  'line-height': `${rowHeight()}px`,
                }}
              >
                {bar().name}
              </span>
            )}
          </Index>
        </Show>
        <Show when={props.band}>
          {(b) => (
            <div
              class={s.band}
              style={{
                left: `${Math.min(b().from, b().to)}px`,
                width: `${Math.abs(b().to - b().from)}px`,
              }}
            />
          )}
        </Show>
        <Show when={props.cursor}>
          {(px) => (
            <>
              <div class={s.timeCursor} style={{ left: `${px() - 0.5}px` }} />
              <Show when={readout()}>
                {(r) => (
                  <CursorChip px={px()} width={props.width}>
                    {readoutView(r)}
                  </CursorChip>
                )}
              </Show>
            </>
          )}
        </Show>
      </div>
      <div class={s.gutter}>
        <Index each={scale()}>
          {(l) => (
            <span class={s.bound} style={{ top: `${lineY(l().v)}px` }}>
              {l().text}
            </span>
          )}
        </Index>
      </div>
      <div
        ref={(el) => {
          top = el;
        }}
        data-row
        class={cx(s.top, props.swipeX !== null && s.swiping)}
        style={props.swipeX === null ? {} : { transform: `translateX(${props.swipeX}px)` }}
      >
        <span class={s.name}>{label}</span>
        <Show when={props.cursor === null ? readout() : null}>{readoutView}</Show>
      </div>
    </div>
  );
}
