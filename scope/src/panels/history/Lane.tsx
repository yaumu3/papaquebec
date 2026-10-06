import { createMemo, Index, Show } from 'solid-js';

import { cx } from '../../design/cx';
import type { ReadingKey } from '../../state/plotted';
import type { Sample } from '../../state/track';
import { stepFromKey } from '../../ui/reorder';
import { READINGS } from '../readings';
import { barbPath, barbsAt, fixed, type LaneTrace, laneTraces, pathOf, valueAt } from './plot';
import { type Dash, PLOTS } from './plots';
import { type Interval, xOf } from './span';
import { barsOf, gapsIn, rangeOf, yOf } from './trace';

import s from './History.module.css';

/** Kept clear above a trace, where the lane's name sits, and below it. */
const PAD_TOP_PX = 14;
const PAD_BOTTOM_PX = 5;
/** Kept clear above and below a gantt bar, within its row. */
const BAR_INSET_PX = 2;
const DOT_PX = 3;
const BARB_PX = 16;

/** The class that dashes a trace, if any. */
export const dashClass = (dash: Dash | undefined): string | undefined => dash && s[dash];

/** One lane of the bay: its grip, its plot over the visible span, and its close button. */
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
  hover: Sample | null;
  /** The pointer is this far across the plot, or has left it. */
  onHover: (x: number | null) => void;
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
  const range = createMemo(() =>
    rangeOf(
      traces()
        .filter((tr) => !tr.floor)
        .map((tr) => tr.runs),
      props.visible,
    ),
  );
  /** Where a trace's values fall: on the lane's scale, or all of them along its floor. */
  const yFor = (tr: LaneTrace) => (tr.floor ? () => props.height - PAD_BOTTOM_PX : y);
  const y = (v: number) => {
    const r = range();
    return r ? yOf(v, r, props.height, PAD_TOP_PX, PAD_BOTTOM_PX) : props.height / 2;
  };
  const gaps = createMemo(() => gapsIn(props.samples, props.visible));
  const bars = createMemo(() => (spec.kind === 'gantt' ? barsOf(props.samples, spec.names) : []));
  const rowHeight = () => props.height / Math.max(1, bars().length);
  const barbs = createMemo(() =>
    spec.kind === 'barbs' ? barbsAt(props.samples, props.ticks, spec.barb) : [],
  );
  const dots = () => {
    const h = props.hover;
    if (!h) return [];
    return traces().flatMap((tr) => {
      const v = valueAt(tr.runs, h.t);
      return v === undefined ? [] : [{ cx: x(h.t), cy: yFor(tr)(v) }];
    });
  };

  return (
    <div class={s.lane} style={{ height: `${props.height}px` }}>
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
      <div class={s.plot}>
        <svg
          class={s.svg}
          width={props.width}
          height={props.height}
          onPointerMove={(e) =>
            props.onHover(e.clientX - e.currentTarget.getBoundingClientRect().left)
          }
          onPointerLeave={() => props.onHover(null)}
        >
          <Index each={gaps()}>
            {(g) => (
              <rect
                class={s.gap}
                x={fixed(x(g().from))}
                y="0"
                width={fixed(x(g().to) - x(g().from))}
                height={props.height}
              />
            )}
          </Index>
          <path
            class={s.grid}
            d={props.ticks.map((t) => `M${fixed(x(t))} 0 V${props.height}`).join(' ')}
          />
          <Index each={traces()}>
            {(tr) => (
              <path
                class={cx(s.trace, dashClass(tr().dash))}
                d={pathOf(tr().runs, x, yFor(tr()))}
              />
            )}
          </Index>
          <Index each={barbs()}>
            {(b) => (
              <path
                class={s.barb}
                d={barbPath(x(b().t), props.height / 2, b().dir, b().speed, BARB_PX)}
              />
            )}
          </Index>
          <Index each={bars()}>
            {(bar, row) => (
              <Index each={bar().on}>
                {(on) => (
                  <rect
                    class={s.bar}
                    x={fixed(x(on().from))}
                    y={fixed(row * rowHeight() + BAR_INSET_PX)}
                    width={fixed(Math.max(1, x(on().to) - x(on().from)))}
                    height={fixed(Math.max(2, rowHeight() - 2 * BAR_INSET_PX))}
                  />
                )}
              </Index>
            )}
          </Index>
          <Show when={props.hover}>
            {(h) => (
              <>
                <line
                  class={s.cursor}
                  x1={fixed(x(h().t))}
                  x2={fixed(x(h().t))}
                  y1="0"
                  y2={props.height}
                />
                <Index each={dots()}>
                  {(d) => <circle class={s.dot} cx={fixed(d().cx)} cy={fixed(d().cy)} r={DOT_PX} />}
                </Index>
              </>
            )}
          </Show>
        </svg>
        <Show when={spec.kind !== 'gantt'}>
          <span class={s.name}>{label}</span>
        </Show>
        <Index each={bars()}>
          {(bar, row) => (
            <span
              class={s.tab}
              style={{
                top: `${row * rowHeight()}px`,
                height: `${rowHeight()}px`,
                'line-height': `${rowHeight()}px`,
              }}
            >
              {bar().name}
            </span>
          )}
        </Index>
      </div>
      <button
        type="button"
        class={s.close}
        aria-label={`Close the ${label} lane`}
        onClick={() => props.onClose()}
      >
        ×
      </button>
    </div>
  );
}
