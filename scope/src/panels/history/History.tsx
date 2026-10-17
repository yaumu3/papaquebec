import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { clockTime } from '../../lib/format';
import { clamp } from '../../lib/math';
import {
  closePlotLane,
  historyOpen,
  hoverInstant,
  movePlotLane,
  plotted,
  setHoverInstant,
  toggleHistory,
} from '../../state/history';
import { lanesOf, readingsIn } from '../../state/plotted';
import { snapshotVersion } from '../../state/scope';
import type { Sample, Track } from '../../state/track';
import { trackStore } from '../../state/tracks';
import { trackReorder } from '../../ui/reorder';
import { trackWidth } from '../../ui/size';
import { axisStep, chipAt, clearOf, clockLabel, spanLabel, ticks } from './axis';
import { Lane } from './Lane';
import { type ScrollView, scrollView } from './scroll';
import { type Interval, resolveSpan, type Span, timeAt, WHOLE, xOf } from './span';
import { Timeline } from './Timeline';
import { nearestSample } from './trace';

import s from './History.module.css';

/** Each lane's height, a hairline under it. */
const LANE_PX = 84;
/** A step of a minute, at which a clock label reads to the minute. */
const MINUTE_SEC = 60;
/** The left edge of a cursor `px` across the plots, as the viewport, wider by the overhang and the gutter, places it. */
const cursorLeft = (px: number): string =>
  `calc(var(--lane-overhang) + var(--plot-left) + ${px - 0.5}px)`;
/** The chip's padding either side of its time, which reads to the second. */
const CHIP_PAD_PX = 3;
const CHIP_CHARS = 8;
/** The notch under the chip, pointing down the cursor. */
const NOTCH_W_PX = 7;
const NOTCH_H_PX = 4;

/** What the lanes plot of the selected target over the visible span, each read at the hovered sample or the latest. */
export function History(props: { track: Track }) {
  const [span, setSpan] = createSignal<Span>(WHOLE);
  // A memo, so that only another target resets the span, not every snapshot of this one.
  const hex = createMemo(() => props.track.hex);
  createEffect(
    on(
      hex,
      () => {
        setSpan(WHOLE);
        setHoverInstant(null);
      },
      { defer: true },
    ),
  );
  // The lanes leave without a pointer-leave when the group folds or goes, so the hover is cleared here.
  createEffect(() => {
    if (!historyOpen()) setHoverInstant(null);
  });
  onCleanup(() => setHoverInstant(null));

  /** The samples, told apart from the last snapshot's though the store appends to one array. */
  const samples = createMemo(
    () => {
      snapshotVersion();
      return props.track.samples;
    },
    undefined,
    { equals: false },
  );
  const contact = createMemo<Interval>(() => {
    const now = trackStore.stats.now;
    return { from: samples()[0]?.t ?? now, to: now };
  });
  const visible = createMemo(() => resolveSpan(span(), contact()));
  const lanes = createMemo(() => lanesOf(plotted()));
  const step = createMemo(() => axisStep(visible().to - visible().from));
  const tickTimes = createMemo(() => ticks(visible(), step()));

  // Signals, as the elements come and go with the group folding and unfolding.
  const [top, setTop] = createSignal<HTMLDivElement>();
  const [labels, setLabels] = createSignal<HTMLDivElement>();
  const width = trackWidth(top);
  /** The axis labels line up with the plots, so their width is the plots'. */
  const plotWidth = trackWidth(labels);
  const x = (t: number) => xOf(t, visible(), Math.max(1, plotWidth()));

  /** The sample under the pointer, kept beside the instant the scope rings, which others may clear. */
  const [hovered, setHovered] = createSignal<Sample | null>(null);
  const hover = createMemo(() => {
    const h = hovered();
    return h && hoverInstant() === h.t ? h : null;
  });
  /** The sample the lanes are read at: the hovered one, else the latest in view. */
  const at = createMemo(() => hover() ?? nearestSample(samples(), visible().to, visible()));
  const hoverAt = (px: number | null) => {
    const near =
      px === null ? null : nearestSample(samples(), timeAt(px, visible(), plotWidth()), visible());
    setHovered(near);
    setHoverInstant(near?.t ?? null);
  };
  /** Hovers the instant under the pointer, none over the gutter or while a lane's grip has it. */
  const pointerAt = (e: PointerEvent) => {
    // A finger holds whatever it lands on, so only a button's hold is a grip's.
    const button = e.target instanceof Element ? e.target.closest('button') : null;
    if (button?.hasPointerCapture(e.pointerId)) return;
    const px = e.clientX - (labels()?.getBoundingClientRect().left ?? 0);
    hoverAt(px < 0 ? null : px);
  };

  const [chipText, setChipText] = createSignal<HTMLSpanElement>();
  const chipTextWidth = trackWidth(chipText);
  /** Where the cursor stands across the plots, mid-pixel and kept whole inside them; nowhere without a lane. */
  const cursorX = () => {
    const a = at();
    return a && lanes().length > 0
      ? clamp(Math.floor(x(a.t)) + 0.5, 0.5, Math.floor(plotWidth()) - 0.5)
      : null;
  };
  /** The chip's width: its time, padding and border. */
  const chipWidth = () => chipTextWidth() + 2 * (CHIP_PAD_PX + 1);
  const chipLeft = (px: number) => chipAt(px, chipWidth(), plotWidth());
  /** Whether each clock label stands clear of the chip, which hides those it would overlap. */
  const clockClear = createMemo(() => {
    const times = tickTimes();
    const cursor = cursorX();
    const first = times[0];
    if (cursor === null || first === undefined) return times.map(() => true);
    // The labels of one step are as long as each other, in the chip's characters.
    const halfPx = (clockLabel(first, step()).length * chipTextWidth()) / CHIP_CHARS / 2;
    const left = chipLeft(cursor);
    return clearOf(times.map(x), left, left + chipWidth(), halfPx);
  });

  const reorder = trackReorder(movePlotLane);

  const [scroller, setScroller] = createSignal<HTMLDivElement>();
  const [view, setView] = createSignal<ScrollView>(scrollView(0, 0, 0));
  const measure = () => {
    const el = scroller();
    if (el) setView(scrollView(el.scrollTop, el.clientHeight, el.scrollHeight));
  };
  // Lanes come and go, which changes how far they scroll.
  createEffect(() => {
    lanes();
    measure();
  });
  // So does the scroller's own size: on a phone it is none until the sheet first shows.
  createEffect(() => {
    const el = scroller();
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      class={cx(s.history, !historyOpen() && s.folded)}
      style={{ '--lane-height': `${LANE_PX}px` }}
    >
      <div class={s.title}>
        <button
          type="button"
          class={s.toggle}
          aria-expanded={historyOpen()}
          onClick={toggleHistory}
        >
          <span class={s.chevron}>{historyOpen() ? '▾' : '▸'}</span>
          HISTORY
        </button>
      </div>
      <Show when={historyOpen()}>
        <div ref={setTop} class={s.span}>
          {spanLabel(visible())}
        </div>
        <Timeline
          samples={samples()}
          lanes={lanes().map((lane) => readingsIn(plotted(), lane))}
          contact={contact()}
          visible={visible()}
          width={width()}
          hover={hoverInstant()}
          onSpan={setSpan}
        />
        <div class={s.ends}>
          <span>{clockLabel(contact().from, MINUTE_SEC)}</span>
          <span>{clockLabel(contact().to, MINUTE_SEC)}</span>
        </div>
        <div class={s.axis}>
          <div ref={setLabels} class={s.labels}>
            <For each={tickTimes()}>
              {(t, i) => (
                <Show when={clockClear()[i()]}>
                  <span class={s.label} style={{ left: `${x(t)}px` }}>
                    {clockLabel(t, step())}
                  </span>
                </Show>
              )}
            </For>
            <Show when={cursorX() !== null && at()}>
              {(a) => (
                <>
                  <span
                    class={cx(s.chip, hover() && s.live)}
                    style={{
                      left: `${chipLeft(cursorX() ?? 0)}px`,
                      padding: `0 ${CHIP_PAD_PX}px`,
                    }}
                  >
                    <span ref={setChipText} class={s.chipTime}>
                      {clockTime(a().t)}
                    </span>
                  </span>
                  <svg
                    class={cx(s.notch, hover() && s.live)}
                    style={{ left: `${(cursorX() ?? 0) - NOTCH_W_PX / 2}px` }}
                    width={NOTCH_W_PX}
                    height={NOTCH_H_PX}
                  >
                    <path d={`M0 0 H${NOTCH_W_PX} L${NOTCH_W_PX / 2} ${NOTCH_H_PX} Z`} />
                  </svg>
                </>
              )}
            </Show>
          </div>
        </div>
        <div class={s.bay}>
          <div
            class={cx(s.viewport, view().cutTop && s.cutTop, view().cutBottom && s.cutBottom)}
            style={(() => {
              const px = cursorX();
              return px === null ? {} : { '--cursor-left': cursorLeft(px) };
            })()}
          >
            <div
              ref={setScroller}
              class={s.scroller}
              onScroll={measure}
              onPointerMove={pointerAt}
              onPointerLeave={() => hoverAt(null)}
            >
              <Show
                when={lanes().length > 0}
                fallback={<div class={s.empty}>Nothing plotted · tap any cell below</div>}
              >
                <For each={lanes()}>
                  {(lane, i) => (
                    <Lane
                      lane={lane}
                      index={i()}
                      count={lanes().length}
                      keys={readingsIn(plotted(), lane)}
                      samples={samples()}
                      visible={visible()}
                      ticks={tickTimes()}
                      width={plotWidth()}
                      height={LANE_PX}
                      at={at()}
                      hovering={hover() !== null}
                      onClose={() => closePlotLane(lane)}
                      onGripDown={(y) => reorder.down(i(), y, LANE_PX + 1, lanes().length)}
                      onGripMove={(y) => reorder.move(y)}
                      onGripStep={(by) => movePlotLane(i(), clamp(i() + by, 0, lanes().length - 1))}
                    />
                  )}
                </For>
              </Show>
            </div>
            <Show when={cursorX()}>
              {(px) => (
                <div
                  class={cx(s.timeCursor, hover() && s.live)}
                  style={{ left: cursorLeft(px()) }}
                />
              )}
            </Show>
          </div>
          <Show when={view().thumb}>
            {(thumb) => (
              <div
                class={s.thumb}
                style={{ top: `${thumb().top}px`, height: `${thumb().height}px` }}
              />
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}
