import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js';

import { cx } from '../../design/cx';
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
import type { Track } from '../../state/track';
import { trackStore } from '../../state/tracks';
import { trackReorder } from '../../ui/reorder';
import { trackWidth } from '../../ui/size';
import { axisStep, clockLabel, spanLabel, ticks } from './axis';
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

  const hover = createMemo(() => {
    const t = hoverInstant();
    return t === null ? null : (samples().find((sample) => sample.t === t) ?? null);
  });
  /** The sample the lanes are read at: the hovered one, else the latest in view. */
  const at = createMemo(() => hover() ?? nearestSample(samples(), visible().to, visible()));
  const hoverAt = (px: number | null) => {
    const near =
      px === null ? null : nearestSample(samples(), timeAt(px, visible(), plotWidth()), visible());
    setHoverInstant(near?.t ?? null);
  };

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
              {(t) => (
                <span class={s.label} style={{ left: `${x(t)}px` }}>
                  {clockLabel(t, step())}
                </span>
              )}
            </For>
          </div>
        </div>
        <div class={s.bay}>
          <div class={cx(s.viewport, view().cutTop && s.cutTop, view().cutBottom && s.cutBottom)}>
            <div ref={setScroller} class={s.scroller} onScroll={measure}>
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
                      hover={hover()}
                      at={at()}
                      onHover={hoverAt}
                      onClose={() => closePlotLane(lane)}
                      onGripDown={(y) => reorder.down(i(), y, LANE_PX + 1, lanes().length)}
                      onGripMove={(y) => reorder.move(y)}
                      onGripStep={(by) => movePlotLane(i(), clamp(i() + by, 0, lanes().length - 1))}
                    />
                  )}
                </For>
              </Show>
            </div>
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
