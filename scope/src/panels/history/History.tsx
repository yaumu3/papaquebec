import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { clockTime } from '../../lib/format';
import {
  closePlotLane,
  historyOpen,
  hoverInstant,
  movePlotLane,
  plotted,
  resetPlotted,
  setHoverInstant,
  toggleHistory,
} from '../../state/history';
import { lanesOf, readingsIn } from '../../state/plotted';
import { snapshotVersion } from '../../state/scope';
import type { Sample, Track } from '../../state/track';
import { trackStore } from '../../state/tracks';
import { Button } from '../../ui/Button';
import { trackReorder } from '../../ui/reorder';
import { trackWidth } from '../../ui/size';
import { READINGS } from '../readings';
import { Value } from '../Value';
import { axisStep, clockLabel, ticks } from './axis';
import { Lane } from './Lane';
import { type Interval, resolveSpan, type Span, timeAt, WHOLE, xOf } from './span';
import { Timeline } from './Timeline';
import { nearestSample } from './trace';

import s from './History.module.css';

/** The lane bay's height, which the lanes in it share, a hairline between each two. */
const BAY_PX = 184;
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
  const [bay, setBay] = createSignal<HTMLDivElement>();
  const [labels, setLabels] = createSignal<HTMLDivElement>();
  const width = trackWidth(bay);
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
  const reset = () => {
    resetPlotted();
    setSpan(WHOLE);
  };

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
          <Show when={historyOpen()}>
            : {clockTime(visible().from)} – {clockTime(visible().to)}Z
          </Show>
        </button>
        <Show when={historyOpen()}>
          <Button onClick={reset}>RESET</Button>
        </Show>
      </div>
      <Show when={historyOpen()}>
        <div ref={setBay} class={s.bay} style={{ height: `${BAY_PX}px` }}>
          <Show
            when={lanes().length > 0}
            fallback={<div class={s.empty}>Nothing plotted · tap any cell below</div>}
          >
            <For each={lanes()}>
              {(lane, i) => (
                <Lane
                  lane={lane}
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
        <Timeline
          samples={samples()}
          lanes={lanes().map((lane) => readingsIn(plotted(), lane))}
          contact={contact()}
          visible={visible()}
          width={width()}
          onSpan={setSpan}
        />
      </Show>
    </div>
  );
}
