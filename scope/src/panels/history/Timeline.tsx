import { createMemo, createSignal, Index, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { clamp } from '../../lib/math';
import type { ReadingKey } from '../../state/plotted';
import type { Sample } from '../../state/track';
import { dashClass } from './Lane';
import { fixed, laneTraces, pathOf } from './plot';
import {
  dragBase,
  dragInterval,
  type Grab,
  grabAt,
  type Interval,
  nudgeSpan,
  type Span,
  spanOf,
  timeAt,
  WHOLE,
  xOf,
} from './span';
import { rangeOf, yOf } from './trace';

import s from './History.module.css';

const HEIGHT_PX = 36;
const PAD_PX = 3;
const HANDLE_W_PX = 5;
const HANDLE_H_PX = 16;
/** How near an edge of the window a press takes hold of it. */
const EDGE_PX = 10;
/** A press that travels less selects nothing. */
const SELECT_MIN_PX = 4;

interface Drag {
  grab: Grab;
  start: Interval;
  t0: number;
  x0: number;
}

/**
 * The whole contact in miniature, the visible span framed as a window. Drag the window to move
 * it, an edge to resize it, the dimmed rest to select a new span; double-click shows everything.
 */
export function Timeline(props: {
  samples: readonly Sample[];
  /** The readings of each lane: its own first, then the intents drawn in it. */
  lanes: readonly (readonly ReadingKey[])[];
  contact: Interval;
  visible: Interval;
  width: number;
  onSpan: (span: Span) => void;
}) {
  let el: SVGSVGElement | undefined;
  const x = (t: number) => xOf(t, props.contact, props.width);
  const timeOf = (e: PointerEvent) =>
    timeAt(e.clientX - (el?.getBoundingClientRect().left ?? 0), props.contact, props.width);
  const secPerPx = () => (props.contact.to - props.contact.from) / Math.max(1, props.width);

  /** Each line of the contact on its own scale. */
  const paths = createMemo(() =>
    props.lanes
      .flatMap((keys) => laneTraces(props.samples, keys, props.contact))
      .map((tr) => {
        const r = tr.floor ? null : rangeOf([tr.runs], props.contact);
        const y = (v: number) => {
          if (tr.floor) return HEIGHT_PX - PAD_PX;
          return r ? yOf(v, r, HEIGHT_PX, PAD_PX, PAD_PX) : HEIGHT_PX / 2;
        };
        return { d: pathOf(tr.runs, x, y), dash: tr.dash };
      }),
  );

  const [selection, setSelection] = createSignal<Interval | null>(null);
  /** What a press where the pointer rests would take hold of, for the cursor. */
  const [zone, setZone] = createSignal<Grab | null>(null);
  let drag: Drag | null = null;

  const grabOf = (e: PointerEvent) => grabAt(timeOf(e), props.visible, EDGE_PX * secPerPx());
  const movable = () =>
    props.visible.from > props.contact.from || props.visible.to < props.contact.to;
  const cursor = () => {
    switch (zone()) {
      case 'left':
      case 'right':
        return s.resize;
      case 'body':
        return movable() ? s.move : undefined;
      case 'outside':
        return s.select;
      default:
        return undefined;
    }
  };

  const down = (e: PointerEvent) => {
    el?.setPointerCapture(e.pointerId);
    const t = timeOf(e);
    drag = { grab: grabOf(e), start: props.visible, t0: t, x0: e.clientX };
  };
  const move = (e: PointerEvent) => {
    if (!drag) {
      setZone(grabOf(e));
      return;
    }
    const base = dragBase(drag.grab, drag.start, props.visible);
    const i = dragInterval(drag.grab, base, drag.t0, timeOf(e), props.contact);
    if (drag.grab === 'outside') setSelection(i);
    else props.onSpan(spanOf(i, props.contact));
  };
  const up = (e: PointerEvent) => {
    const chosen = selection();
    if (drag?.grab === 'outside' && chosen && Math.abs(e.clientX - drag.x0) >= SELECT_MIN_PX) {
      props.onSpan(spanOf(chosen, props.contact));
    }
    setSelection(null);
    drag = null;
  };

  const left = () => x(props.visible.from);
  const right = () => x(props.visible.to);
  return (
    <svg
      ref={(node) => {
        el = node;
      }}
      class={cx(s.timeline, cursor())}
      height={HEIGHT_PX}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => setZone(null)}
      onDblClick={() => props.onSpan(WHOLE)}
      tabindex="0"
      onKeyDown={(e) => {
        const span = nudgeSpan(e.key, props.visible, props.contact);
        if (!span) return;
        e.preventDefault();
        props.onSpan(span);
      }}
      aria-label="Whole contact. Drag the window to move it, an edge to resize it, the rest to select; the left and right arrows move it, the up and down arrows narrow and widen it; double-click or Home shows everything."
    >
      <rect
        class={s.frame}
        x="0.5"
        y="0.5"
        width={Math.max(0, props.width - 1)}
        height={HEIGHT_PX - 1}
      />
      <Index each={paths()}>
        {(p) => <path class={cx(s.mini, dashClass(p().dash))} d={p().d} />}
      </Index>
      <path
        class={s.dim}
        d={`M0 0 H${fixed(left())} V${HEIGHT_PX} H0 Z M${fixed(right())} 0 H${props.width} V${HEIGHT_PX} H${fixed(right())} Z`}
      />
      <rect
        class={s.window}
        x={fixed(left())}
        y="0.5"
        width={fixed(Math.max(0, right() - left()))}
        height={HEIGHT_PX - 1}
      />
      <Index each={[left(), right()]}>
        {(hx) => (
          <rect
            class={s.handle}
            x={fixed(clamp(hx() - HANDLE_W_PX / 2, 0, props.width - HANDLE_W_PX))}
            y={(HEIGHT_PX - HANDLE_H_PX) / 2}
            width={HANDLE_W_PX}
            height={HANDLE_H_PX}
          />
        )}
      </Index>
      <Show when={selection()}>
        {(sel) => (
          <rect
            class={s.selection}
            x={fixed(x(sel().from))}
            y="0.5"
            width={fixed(Math.max(0, x(sel().to) - x(sel().from)))}
            height={HEIGHT_PX - 1}
          />
        )}
      </Show>
    </svg>
  );
}
