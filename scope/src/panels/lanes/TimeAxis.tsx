import { createMemo, createSignal, For, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { formatAgo } from '../../lib/format';
import type { LanesWindow } from '../../state/window';
import { trackWidth } from '../../ui/size';
import { clearOf, clearOfEnds, endLabel } from './axis';

import s from './Lanes.module.css';

/** An age as the labels read it, measured for their width. */
const RULER = '−00:00';
/** The least room between a label and the end label. */
const GAP_PX = 4;

/**
 * The relative time scale under the last history lane: a label at each tick, and how far back the
 * window ends at its right edge.
 */
export function TimeAxis(props: {
  /** The seconds of the ticks, and where each falls across the plots. */
  ticks: readonly number[];
  x: (t: number) => number;
  width: number;
  now: number;
  window: LanesWindow;
  /** How far back the window ends, seconds. */
  lag: number;
  order: number;
  rowRef: (el: HTMLDivElement) => void;
}) {
  const [ruler, setRuler] = createSignal<HTMLSpanElement>();
  const [end, setEnd] = createSignal<HTMLSpanElement>();
  const labelWidth = trackWidth(ruler);
  const endWidth = trackWidth(end);
  const half = () => labelWidth() / 2;
  const label = () => endLabel(props.window, props.lag);
  /** The ticks whose labels fit whole over the plots. */
  const inside = createMemo(() => clearOfEnds(props.ticks, props.x, props.width, half()));
  /** Whether each label stands clear of the end label, which hides those it would overlap. */
  const clear = createMemo(() =>
    clearOf(inside().map(props.x), props.width - endWidth(), props.width, half() + GAP_PX),
  );

  return (
    <div ref={props.rowRef} data-axis class={s.axis} style={{ order: props.order }}>
      <For each={inside()}>
        {(t, i) => (
          <Show when={clear()[i()]}>
            <span class={s.label} style={{ left: `${props.x(t)}px` }}>
              {formatAgo(props.now - t)}
            </span>
          </Show>
        )}
      </For>
      <span ref={setRuler} class={cx(s.label, s.ruler)} aria-hidden="true">
        {RULER}
      </span>
      <span ref={setEnd} class={cx(s.endLabel, label().held && s.endHeld)}>
        {label().text}
      </span>
    </div>
  );
}
