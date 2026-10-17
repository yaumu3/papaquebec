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
import { READINGS } from '../readings';
import { Value } from '../Value';
import { axisStep, clockLabel, spanLabel, ticks } from './axis';
import { Lane } from './Lane';
import { type Interval, resolveSpan, type Span, timeAt, WHOLE, xOf } from './span';
import { Timeline } from './Timeline';
import { nearestSample } from './trace';

import s from './History.module.css';

/** The lane bay's height, which the lanes in it share, a hairline between each two. */
const BAY_PX = 184;
/** A step of a minute, at which a clock label reads to the minute. */
const MINUTE_SEC = 60;
/** How far the hover box stands from the cursor. */
const BOX_GAP_PX = 12;

/** The height of each of `count` lanes in the bay, less the hairlines between them. */
const laneHeight = (count: number) => Math.floor((BAY_PX - (count - 1)) / count);

/** What the lanes plot of the selected target over the visible span, and the box at the hovered sample. */
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
  const height = createMemo(() => laneHeight(lanes().length));
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
  const hoverAt = (px: number | null) => {
    const at =
      px === null ? null : nearestSample(samples(), timeAt(px, visible(), plotWidth()), visible());
    setHoverInstant(at?.t ?? null);
  };
  /** The box stands beside the cursor on whichever side has more room. */
  const boxStyle = (h: Sample) => {
    const hx = x(h.t);
    return hx < plotWidth() / 2
      ? { left: `${hx + BOX_GAP_PX}px` }
      : { right: `${plotWidth() - hx + BOX_GAP_PX}px` };
  };

  const reorder = trackReorder(movePlotLane);

  return (
    <div class={cx(s.history, !historyOpen() && s.folded)}>
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
        <div class={s.bay} style={{ height: `${BAY_PX}px` }}>
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
                  height={height()}
                  hover={hover()}
                  onHover={hoverAt}
                  onClose={() => closePlotLane(lane)}
                  onGripDown={(y) => reorder.down(i(), y, height() + 1, lanes().length)}
                  onGripMove={(y) => reorder.move(y)}
                  onGripStep={(by) => movePlotLane(i(), clamp(i() + by, 0, lanes().length - 1))}
                />
              )}
            </For>
          </Show>
          <div class={s.overlay}>
            <Show when={hover()}>
              {(h) => (
                <div class={s.box} style={boxStyle(h())}>
                  <div class={s.time}>{clockTime(h().t)}Z</div>
                  <For each={lanes().flatMap((lane) => readingsIn(plotted(), lane))}>
                    {(key) => (
                      <div class={s.row}>
                        <span class={s.rowLabel}>{READINGS[key].label}</span>
                        <Value r={READINGS[key].format(h())} />
                      </div>
                    )}
                  </For>
                </div>
              )}
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
