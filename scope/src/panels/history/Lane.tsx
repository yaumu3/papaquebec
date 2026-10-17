import { createMemo, Index, Show } from 'solid-js';

import { cx } from '../../design/cx';
import type { ReadingKey } from '../../state/plotted';
import type { Sample } from '../../state/track';
import { stepFromKey } from '../../ui/reorder';
import { READINGS } from '../readings';
import { clearOfEnds, clockStep, ticks } from './axis';
import {
  atTicks,
  barbPath,
  barbReach,
  fixed,
  GLYPH_REACH_PX,
  headingGlyph,
  laneRange,
  type LaneTrace,
  laneTraces,
  pathOf,
  scaleLabels,
} from './plot';
import { type Dash, HEARD, PLOTS } from './plots';
import { readoutOf } from './readout';
import { type Interval, xOf } from './span';
import { barsOf, gapsIn, type Read, yOf } from './trace';

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

/** The widest each intent reads, in characters, so that its slot in the readout keeps one width. */
const INTENT_CH: Partial<Record<ReadingKey, number>> = { selAlt: 5, fmsAlt: 5, selHdg: 4 };
/** The sample of the other target's line in the readout. */
const SAMPLE_PX = 12;
const SAMPLE_H_PX = 8;

/** The class that dashes a trace, if any. */
export const dashClass = (dash: Dash | undefined): string | undefined => dash && s[dash];

/** The dash an intent is drawn with, if any. */
const dashOf = (key: ReadingKey): Dash | undefined => {
  const p = PLOTS[key];
  return p.kind === 'intent' ? p.dash : undefined;
};

/** One lane of the bay: a top row with its grip, name and close button, then its scale and its plot over the visible span. */
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
  /** The sample the lane is read at, and whether it is the one hovered. */
  at: Sample | null;
  hovering: boolean;
  onClose: () => void;
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
  /** What the intent plotted in the lane reads, if one is. */
  const intentRead = (): Read | undefined => {
    const intent = props.keys
      .slice(1)
      .map((key) => PLOTS[key])
      .find((p) => p.kind === 'intent');
    return intent?.kind === 'intent' ? intent.y : undefined;
  };
  const glyphs = createMemo(() => {
    if (spec.kind !== 'heading') return [];
    const sel = intentRead();
    const read = (sample: Sample) => {
      const h = spec.heading(sample);
      return h && { ...h, sel: sel?.(sample) };
    };
    // A tick takes a sample with a heading a little off it over the nearest without, so that
    // the aircraft does not come and go with the replies that carry its heading.
    const step = stepEvery(GLYPH_PITCH_PX);
    const has = (sample: Sample) => spec.heading(sample)?.hdg !== undefined;
    return atTicks(
      props.samples,
      ticksAt(step, GLYPH_REACH_PX),
      read,
      {
        has,
        withinSec: step / 2,
      },
      HEARD[props.lane],
    ).map((h) => headingGlyph(x(h.t), mid(), h));
  });
  const readout = createMemo(() => (props.at ? readoutOf(props.keys, props.at) : null));
  /** How wide the intents' slots are: as wide as the widest intent plotted in the lane. */
  const slotCh = () => Math.max(0, ...props.keys.slice(1).map((key) => INTENT_CH[key] ?? 0));

  return (
    <div class={s.lane} style={{ height: `${props.height}px` }}>
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
        <span class={s.name}>{label}</span>
        <button
          type="button"
          class={s.close}
          aria-label={`Close the ${label} lane`}
          onClick={() => props.onClose()}
        >
          ×
        </button>
        <Show when={readout()}>
          {(r) => (
            <div class={s.readout}>
              <span class={cx(props.hovering && s.hovered)}>{r().value}</span>
              <Show when={slotCh() > 0}>
                <span class={cx(s.slot, s.intentText)} style={{ width: `${slotCh()}ch` }}>
                  {r().first?.text}
                </span>
              </Show>
              <Show when={props.keys.length > 2}>
                <svg class={s.sample} width={SAMPLE_PX} height={SAMPLE_H_PX}>
                  <Show when={r().other}>
                    {(o) => (
                      <line
                        class={cx(s.trace, dashClass(dashOf(o().key)), s.intentDim)}
                        x1="0"
                        x2={SAMPLE_PX}
                        y1={SAMPLE_H_PX / 2}
                        y2={SAMPLE_H_PX / 2}
                      />
                    )}
                  </Show>
                </svg>
                <span class={cx(s.slot, s.intentDim)} style={{ width: `${slotCh()}ch` }}>
                  {r().other?.text}
                </span>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
