import { createMemo, Index, Show } from 'solid-js';

import { cx } from '../../design/cx';
import type { ReadingKey } from '../../state/plotted';
import type { Sample } from '../../state/track';
import { stepFromKey } from '../../ui/reorder';
import { NONE, READINGS } from '../readings';
import { clearOfEnds, clockStep, ticks } from './axis';
import {
  atTicks,
  barbPath,
  barbReach,
  fixed,
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
import { heldIntents, readoutOf, readoutSlots, type Slot } from './readout';
import { type Interval, xOf } from './span';
import { barsOf, gapsIn, yOf } from './trace';

import s from './History.module.css';

/** The data band: below the lane's top row, where its name sits, and clear of its foot. */
const PAD_TOP_PX = 28;
const PAD_BOTTOM_PX = 11;
/** How far the clock lines and the gaps stop short of the lane's top and bottom. */
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

/** The most characters each intent reads in. */
const INTENT_CH: Partial<Record<ReadingKey, number>> = { selAlt: 5, fmsAlt: 5, selHdg: 4 };
/** The sample of the second slot's line in the readout. */
const SAMPLE_PX = 12;
const SAMPLE_H_PX = 8;

/** What a readout slot reads: its intent, the blank of the unknown, or nothing when it agrees with the other. */
const slotText = (slot: Slot): string => (slot.blank ? '' : (slot.text ?? NONE.v));
/** Whether a readout slot holds an intent unknown at the instant. */
const unknown = (slot: Slot): boolean => slot.text === undefined && !slot.blank;

/** The class that dashes a trace, if any. */
export const dashClass = (dash: Dash | undefined): string | undefined => dash && s[dash];

/** The dash an intent is drawn with, if any. */
const dashOf = (key: ReadingKey): Dash | undefined => {
  const p = PLOTS[key];
  return p.kind === 'intent' ? p.dash : undefined;
};

/** One lane of the bay: a top row with its grip and the dropdown of its name, then its scale and its plot over the visible span. */
export function Lane(props: {
  lane: ReadingKey;
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
  /** The sample the lane is read at, and whether it is an earlier one than the latest. */
  at: Sample | null;
  past: boolean;
  /** Whether the lane's palette is open, and the dropdown that opens it. */
  menuOpen: boolean;
  menuRef: (el: HTMLButtonElement) => void;
  onMenu: (anchor: HTMLElement) => void;
  onGripDown: (y: number) => void;
  onGripMove: (y: number) => void;
  /** The arrow keys move the lane a place up or down. */
  onGripStep: (step: -1 | 1) => void;
}) {
  const spec = PLOTS[props.lane];
  const label = READINGS[props.lane].label;
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
  /** The shortest round clock step that keeps glyphs at least `pitch` apart across the visible span. */
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
  /** How wide the intents' slots are: as wide as the widest of them. */
  const slotCh = () => Math.max(0, ...held().map((key) => INTENT_CH[key] ?? 0));

  return (
    <div data-lane class={s.lane} style={{ height: `${props.height}px` }}>
      <div class={s.plot}>
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
      <div class={s.top}>
        <button
          type="button"
          class={s.grip}
          aria-label={`${label} lane, ${props.index + 1} of ${props.count}. Drag or press an arrow key to move it.`}
          onKeyDown={(e) => {
            const step = stepFromKey(e.key);
            if (step === null) return;
            e.preventDefault();
            props.onGripStep(step);
            // The lane moved in the DOM, which blurs its grip.
            e.currentTarget.focus();
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            props.onGripDown(e.clientY);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) props.onGripMove(e.clientY);
          }}
        >
          ⋮⋮
        </button>
        <button
          ref={props.menuRef}
          type="button"
          class={cx(s.menu, props.menuOpen && s.open)}
          aria-haspopup="dialog"
          aria-expanded={props.menuOpen}
          onClick={(e) => props.onMenu(e.currentTarget)}
        >
          {label}
          <span class={s.caret}>{props.menuOpen ? '▲' : '▼'}</span>
        </button>
        <Show when={readout()}>
          {(r) => (
            <div class={s.readout}>
              <span class={cx(r().unknown ? s.unknown : props.past && s.past)}>{r().value}</span>
              <Index each={slots()}>
                {(slot, i) => (
                  <>
                    <Show when={i === 1}>
                      <svg class={s.sample} width={SAMPLE_PX} height={SAMPLE_H_PX}>
                        <Show when={!slot().blank}>
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
                        </Show>
                      </svg>
                    </Show>
                    <span
                      class={cx(
                        s.slot,
                        i === 0 ? s.intentText : s.intentDim,
                        unknown(slot()) && s.unknown,
                      )}
                      style={{ width: `${slotCh()}ch` }}
                    >
                      {slotText(slot())}
                    </span>
                  </>
                )}
              </Index>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
