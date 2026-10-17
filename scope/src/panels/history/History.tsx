import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { clockTime } from '../../lib/format';
import { clamp } from '../../lib/math';
import {
  addPlotLane,
  historyOpen,
  hoverInstant,
  movePlotLane,
  plotted,
  removePlotLane,
  setHoverInstant,
  switchPlotLane,
  toggleHistory,
} from '../../state/history';
import { laneAfter, type LaneKey, readingsIn } from '../../state/plotted';
import { snapshotVersion } from '../../state/scope';
import type { Track } from '../../state/track';
import { trackStore } from '../../state/tracks';
import { trackReorder } from '../../ui/reorder';
import { trackWidth } from '../../ui/size';
import { axisStep, chipAt, clearOf, clearOfEnds, clockLabel, spanLabel, ticks } from './axis';
import { chipOf } from './chips';
import { Lane } from './Lane';
import type { LaneMoves } from './moves';
import { Palette } from './Palette';
import { type ScrollView, scrollView } from './scroll';
import { type Interval, resolveSpan, type Span, WHOLE, xOf } from './span';
import { Timeline } from './Timeline';
import { restSample, sampleAt, seesAll } from './trace';

import s from './History.module.css';

/** Each lane's height, a hairline under it. */
const LANE_PX = 84;
/** A step of a minute, at which a clock label reads to the minute. */
const MINUTE_SEC = 60;
/** The left edge of a cursor `px` across the plots, as the viewport, wider by the overhang and the gutter, places it. */
const cursorLeft = (px: number): string =>
  `calc(var(--lane-overhang) + var(--plot-left) + ${px - 0.5}px)`;
/** The chip's padding either side of its time. */
const CHIP_PAD_PX = 3;
/** A clock time to the second, measured for the clock labels' width per character. */
const RULER = '00:00:00';
/** The least room between the chip and a clock label. */
const CHIP_GAP_PX = 4;
/** The notch under the chip, pointing down the cursor. */
const NOTCH_W_PX = 7;
const NOTCH_H_PX = 4;
/** Between a palette and the control it hangs from. */
const PALETTE_GAP_PX = 2;

/** What the lanes plot of the selected target over the visible span, each read at the hovered sample or the last in view. */
export function History(props: { track: Track }) {
  const [span, setSpan] = createSignal<Span>(WHOLE);
  /** How far across the plots the pointer is, if it is over them. */
  const [hoverPx, setHoverPx] = createSignal<number | null>(null);
  // A memo, so that only another target resets the span, not every snapshot of this one.
  const hex = createMemo(() => props.track.hex);
  createEffect(
    on(
      hex,
      () => {
        setSpan(WHOLE);
        setHoverPx(null);
      },
      { defer: true },
    ),
  );
  // The lanes leave without a pointer-leave when the group folds or goes, so the hover is cleared here.
  createEffect(() => {
    if (!historyOpen()) setHoverPx(null);
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
  const step = createMemo(() => axisStep(visible().to - visible().from));
  const tickTimes = createMemo(() => ticks(visible(), step()));

  // Signals, as the elements come and go with the group folding and unfolding.
  const [top, setTop] = createSignal<HTMLDivElement>();
  const [labels, setLabels] = createSignal<HTMLDivElement>();
  const width = trackWidth(top);
  /** The axis labels line up with the plots, so their width is the plots'. */
  const plotWidth = trackWidth(labels);
  const x = (t: number) => xOf(t, visible(), Math.max(1, plotWidth()));

  /** The sample under the pointer, as the span moves under it too. */
  const hover = createMemo(() => {
    const px = hoverPx();
    return px === null ? null : sampleAt(samples(), px, visible(), plotWidth());
  });
  // The scope rings the hovered sample on the trail.
  createEffect(on(hover, (h) => setHoverInstant(h?.t ?? null)));
  /** Where the cursor rests: the last sample in view. */
  const rest = createMemo(() => restSample(samples(), visible()));
  /** The sample the lanes are read at: the hovered one, else the one the cursor rests at. */
  const at = createMemo(() => hover() ?? rest()?.sample ?? null);
  /** Whether the cursor stands away from the latest sample: hovered, or resting in the past. */
  const past = () => hover() !== null || rest()?.current === false;
  /** Hovers the instant under the pointer, none off the lanes, over the gutter or while a lane's grip has it. */
  const pointerAt = (e: PointerEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    // A finger holds whatever it lands on, so only a button's hold is a grip's.
    if (target?.closest('button')?.hasPointerCapture(e.pointerId)) return;
    const px = e.clientX - (labels()?.getBoundingClientRect().left ?? 0);
    setHoverPx(px < 0 || !target?.closest('[data-lane]') ? null : px);
  };

  const [chipText, setChipText] = createSignal<HTMLSpanElement>();
  const chipTextWidth = trackWidth(chipText);
  const [ruler, setRuler] = createSignal<HTMLSpanElement>();
  const rulerWidth = trackWidth(ruler);
  /** Where the cursor stands across the plots, mid-pixel and kept whole inside them; nowhere without a lane. */
  const cursorX = () => {
    const a = at();
    return a && plotted().length > 0
      ? clamp(Math.floor(x(a.t)) + 0.5, 0.5, Math.floor(plotWidth()) - 0.5)
      : null;
  };
  /** The chip's width: its time, padding and border. */
  const chipWidth = () => chipTextWidth() + 2 * (CHIP_PAD_PX + 1);
  const chipLeft = (px: number) => chipAt(px, chipWidth(), plotWidth());
  /** Half a clock label's width, at the ruler's width per character: the labels of one step are as long as each other. */
  const labelHalf = () => {
    const first = tickTimes()[0];
    return first === undefined
      ? 0
      : (clockLabel(first, step()).length * rulerWidth()) / RULER.length / 2;
  };
  /** The ticks whose labels fit whole over the plots. */
  const labelTimes = createMemo(() => clearOfEnds(tickTimes(), x, plotWidth(), labelHalf()));
  /** Whether each clock label stands clear of the chip, which hides those it would overlap. */
  const clockClear = createMemo(() => {
    const times = labelTimes();
    const cursor = cursorX();
    if (cursor === null) return times.map(() => true);
    const left = chipLeft(cursor);
    return clearOf(times.map(x), left, left + chipWidth(), labelHalf() + CHIP_GAP_PX);
  });

  const reorder = trackReorder(movePlotLane);

  const [bay, setBay] = createSignal<HTMLDivElement>();
  /** The top row of each lane, its handle, which keeps the focus for it. */
  const rows = new Map<LaneKey, HTMLElement>();
  /** The button under the lanes that opens the palette to add one. */
  let add: HTMLButtonElement | undefined;
  /** The palette open, if one is: for a lane, or with none to add one; under its anchor. */
  const [menu, setMenu] = createSignal<{
    own: LaneKey | null;
    anchor: HTMLElement;
    top: number;
  } | null>(null);
  const closeMenu = () => setMenu(null);
  createEffect(on(hex, closeMenu, { defer: true }));
  /** Opens the palette under `anchor`, or closes it when it is open there already. */
  const toggleMenu = (own: LaneKey | null, anchor: HTMLElement) => {
    if (menu()?.anchor === anchor) {
      closeMenu();
      return;
    }
    const below = anchor.getBoundingClientRect().bottom - (bay()?.getBoundingClientRect().top ?? 0);
    setMenu({ own, anchor, top: below + PALETTE_GAP_PX });
  };
  /** Brings a lane into view and gives its top row the focus; with none, + LANE. */
  const reveal = (lane: LaneKey | null) => {
    const el = (lane && rows.get(lane)) || add;
    if (!el) return;
    (el.closest('[data-lane]') ?? el).scrollIntoView({ block: 'nearest' });
    el.focus({ preventScroll: true });
  };
  const pick = (lane: LaneKey) => {
    const m = menu();
    if (!m) return;
    closeMenu();
    const chip = chipOf(plotted(), m.own, lane);
    if (chip === 'free') {
      if (m.own) switchPlotLane(m.own, lane);
      else addPlotLane(lane);
    }
    reveal(lane);
  };
  /** The LANE row of the palette of `own`. */
  const movesOf = (own: LaneKey): LaneMoves => {
    const i = () => plotted().indexOf(own);
    const move = (to: number) => {
      closeMenu();
      movePlotLane(i(), to);
      reveal(own);
    };
    return {
      first: i() === 0,
      last: i() === plotted().length - 1,
      onUp: () => move(i() - 1),
      onDown: () => move(i() + 1),
      onRemove: () => {
        const next = laneAfter(plotted(), own);
        closeMenu();
        removePlotLane(own);
        reveal(next);
      },
    };
  };

  const [scroller, setScroller] = createSignal<HTMLDivElement>();
  const [view, setView] = createSignal<ScrollView>(scrollView(0, 0, 0));
  const measure = () => {
    const el = scroller();
    if (el) setView(scrollView(el.scrollTop, el.clientHeight, el.scrollHeight));
  };
  // Lanes come and go, which changes how far they scroll.
  createEffect(() => {
    plotted();
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
      data-history
      class={cx(s.history, !historyOpen() && s.folded)}
      style={{ '--lane-height': `${LANE_PX}px`, '--notch-height': `${NOTCH_H_PX}px` }}
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
          <Show when={!seesAll(visible(), samples())}>
            <span class={s.contactSpan}>
              {clockLabel(contact().from, MINUTE_SEC)} – {clockLabel(contact().to, MINUTE_SEC)}
            </span>
          </Show>
          <span class={s.visibleSpan}>{spanLabel(visible())}</span>
        </div>
        <Timeline
          samples={samples()}
          lanes={plotted().map(readingsIn)}
          contact={contact()}
          visible={visible()}
          width={width()}
          hover={hoverInstant()}
          onSpan={setSpan}
        />
        <div class={s.axis}>
          <div ref={setLabels} class={s.labels}>
            <For each={labelTimes()}>
              {(t, i) => (
                <Show when={clockClear()[i()]}>
                  <span class={s.label} style={{ left: `${x(t)}px` }}>
                    {clockLabel(t, step())}
                  </span>
                </Show>
              )}
            </For>
            <span ref={setRuler} class={cx(s.label, s.ruler)} aria-hidden="true">
              {RULER}
            </span>
            <Show when={cursorX() !== null && at()}>
              {(a) => (
                <>
                  <span
                    class={cx(s.chip, past() && s.live)}
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
                    class={cx(s.notch, past() && s.live)}
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
        <div ref={setBay} class={s.bay}>
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
              onScroll={() => {
                measure();
                closeMenu();
              }}
              onPointerMove={pointerAt}
              onPointerLeave={() => setHoverPx(null)}
            >
              <For each={plotted()}>
                {(lane, i) => {
                  onCleanup(() => rows.delete(lane));
                  return (
                    <Lane
                      lane={lane}
                      index={i()}
                      count={plotted().length}
                      keys={readingsIn(lane)}
                      samples={samples()}
                      visible={visible()}
                      ticks={tickTimes()}
                      width={plotWidth()}
                      height={LANE_PX}
                      at={at()}
                      past={past()}
                      menuOpen={menu()?.own === lane}
                      rowRef={(el) => rows.set(lane, el)}
                      moves={movesOf(lane)}
                      onMenu={(anchor) => toggleMenu(lane, anchor)}
                      onGripDown={(y) => reorder.down(i(), y, LANE_PX + 1, plotted().length)}
                      onGripMove={(y) => reorder.move(y)}
                    />
                  );
                }}
              </For>
              <div class={s.addRow}>
                <button
                  ref={(el) => {
                    add = el;
                  }}
                  type="button"
                  class={cx(s.add, menu()?.anchor === add && s.open)}
                  aria-haspopup="dialog"
                  aria-expanded={menu()?.anchor === add}
                  onClick={(e) => toggleMenu(null, e.currentTarget)}
                >
                  + LANE
                </button>
              </div>
            </div>
            <Show when={cursorX()}>
              {(px) => (
                <div
                  class={cx(s.timeCursor, past() && s.live)}
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
          <Show when={menu()}>
            {(m) => (
              <Palette
                own={m().own}
                plotted={plotted()}
                top={m().top}
                anchor={m().anchor}
                moves={(() => {
                  const own = m().own;
                  return own === null ? undefined : movesOf(own);
                })()}
                onPick={pick}
                onClose={closeMenu}
              />
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}
