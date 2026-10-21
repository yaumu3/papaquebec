import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

import { cx } from '../../design/cx';
import { clamp } from '../../lib/math';
import {
  addPlotLane,
  lanesView,
  movePlotLane,
  plotted,
  removePlotLane,
  setCursorInstant,
  setHoverInstant,
  setLaneScroll,
  setLanesWindow,
  switchPlotLane,
} from '../../state/lanes';
import {
  historyLanesOf,
  isInstrumentLane,
  laneAfter,
  lastHistoryIndex,
  type LaneKey,
  readingsIn,
} from '../../state/plotted';
import { snapshotVersion } from '../../state/scope';
import type { Track } from '../../state/track';
import { trackStore } from '../../state/tracks';
import {
  contactOf,
  DEFAULT_WINDOW,
  keyWindow,
  readsPast,
  resolveWindow,
  selectWindow,
  timeAt,
  xOf,
} from '../../state/window';
import { placeOf } from '../../ui/reorder';
import { trackWidth } from '../../ui/size';
import { isLost } from '../instruments/freshness';
import { momentOf } from '../instruments/moment';
import { LANE_LABELS, NONE } from '../readings';
import { axisStep, ticks } from './axis';
import { pickOf } from './chips';
import { axisShift, liftLeft, slotShown } from './drag';
import { HOLD_MS, isDoubleTap, MENU_HOLD_MS, type Tap } from './hold';
import { InstrumentLane } from './InstrumentLane';
import { Lane } from './Lane';
import { createLaneDrag } from './laneDrag';
import {
  addMenuAnchor,
  clickSourceOf,
  contextSourceOf,
  laneMenuAnchor,
  type PaletteAnchor,
} from './menu';
import type { LaneMoves } from './moves';
import { Palette } from './Palette';
import { readoutOf } from './readout';
import { type ScrollView, scrollView } from './scroll';
import { swipeOffset } from './swipe';
import { TimeAxis } from './TimeAxis';
import { gapsIn, newestSample, peekAt } from './trace';
import { createWindowInput } from './windowInput';

import s from './Lanes.module.css';

/** Each lane's height, a hairline under it. */
const LANE_PX = 84;
/** Between the chip lifted with a dragged lane and the pointer under it. */
const LIFT_GAP_PX = 4;

/** Applies a pick of `lane` in the palette of `own`: it takes the place of `own`, joins the column, or is open already. */
function take(own: LaneKey | null, lane: LaneKey): void {
  const what = pickOf(plotted(), own, lane);
  if (what === 'switch' && own) switchPlotLane(own, lane);
  else if (what === 'add') addPlotLane(lane);
}

/** What the lanes plot of the selected target over the visible window, each read at the hovered sample or the last in view. */
export function Lanes(props: { track: Track }) {
  /** How far across the plots the pointer is, if it is over them. */
  const [hoverPx, setHoverPx] = createSignal<number | null>(null);
  const hex = createMemo(() => props.track.hex);
  // A memo, so that scrolling the lanes, which keeps the window, redraws none of them.
  const lanesWindow = createMemo(() => lanesView(hex()).window);
  onCleanup(() => {
    setHoverInstant(null);
    setCursorInstant(null);
  });

  /** The samples, told apart from the last snapshot's though the store appends to one array. */
  const samples = createMemo(
    () => {
      snapshotVersion();
      return props.track.samples;
    },
    undefined,
    { equals: false },
  );
  const contact = createMemo(() => contactOf(samples(), trackStore.stats.now));
  const visible = createMemo(() => resolveWindow(lanesWindow(), contact()));
  const gaps = createMemo(() => gapsIn(samples(), visible(), isLost(props.track)));
  const now = () => contact().to;
  const step = createMemo(() => axisStep(visible().to - visible().from));
  const tickTimes = createMemo(() => ticks(visible(), step(), now()));

  const [axisRow, setAxisRow] = createSignal<HTMLDivElement>();
  /** The axis row lines up with the plots, so its width is the plots'. */
  const plotWidth = trackWidth(axisRow);
  const x = (t: number) => xOf(t, visible(), Math.max(1, plotWidth()));
  const reset = () => setLanesWindow(hex(), DEFAULT_WINDOW);
  /** The last finger tap on a history lane, which a second one soon after and near makes a double. */
  let lastTap: Tap | null = null;
  const plotLeft = () => axisRow()?.getBoundingClientRect().left ?? 0;
  const plotPx = (clientX: number) => clamp(clientX - plotLeft(), 0, plotWidth());
  /** The instant a mouse pressed at, while it selects a span: the band's fixed end. */
  const [pressedAt, setPressedAt] = createSignal<number | null>(null);
  const band = () => {
    const t0 = pressedAt();
    const px = hoverPx();
    return t0 === null || px === null ? null : { from: clamp(x(t0), 0, plotWidth()), to: px };
  };
  const stopSelecting = () => {
    setPressedAt(null);
    setHoverPx(null);
  };

  /** The cursor under the pointer, as the window moves under it too; none without a history lane. */
  const peek = createMemo(() => {
    const px = hoverPx();
    if (px === null || historyLanesOf(plotted()).length === 0) return null;
    return peekAt(samples(), px, visible(), plotWidth(), isLost(props.track));
  });
  // The scope rings the peeked sample on the trail, none over a gap.
  createEffect(
    on(peek, (p) => {
      setHoverInstant(p?.sample?.t ?? null);
      setCursorInstant(p?.t ?? null);
    }),
  );
  /** The sample the lanes are read at: the peeked one, none over a gap, else the newest in view. */
  const at = createMemo(() => {
    const p = peek();
    return p ? p.sample : newestSample(samples(), visible());
  });
  /** Whether the lanes read an instant other than now. */
  const past = () => readsPast(peek() !== null, lanesWindow());
  /** What the instruments draw at the cursor. */
  const moment = createMemo(() =>
    momentOf(props.track, peek() !== null, at(), trackStore.stats.now),
  );
  /** Hovers the instant under the pointer, none off the history lanes, over the gutter or while a lane is dragged or swiped; a finger only peeks. */
  const pointerAt = (e: PointerEvent) => {
    const el = e.target instanceof Element ? e.target.closest('[data-lane="history"]') : null;
    if (e.pointerType === 'touch' || pressedAt() !== null || peeking()) return;
    const px = e.clientX - plotLeft();
    setHoverPx(px < 0 || drag() || swipe() || !el ? null : px);
  };

  /** Where the cursor stands across the plots, mid-pixel and kept whole inside them; nowhere unless hovering a history lane. */
  const cursorX = () => {
    const p = peek();
    return p ? clamp(Math.floor(x(p.t)) + 0.5, 0.5, Math.floor(plotWidth()) - 0.5) : null;
  };

  const [bay, setBay] = createSignal<HTMLDivElement>();
  const bayBox = () => bay()?.getBoundingClientRect();
  /** Each lane, which keeps the focus for it. */
  const lanes = new Map<LaneKey, HTMLElement>();
  /** The button under the lanes that opens the palette to add one. */
  let add: HTMLButtonElement | undefined;
  /** The palette open, if one is: for a lane, or with none to add one; under its anchor. */
  const [menu, setMenu] = createSignal<{
    own: LaneKey | null;
    anchor: HTMLElement;
    at: PaletteAnchor;
  } | null>(null);
  const closeMenu = () => setMenu(null);
  createEffect(on(hex, closeMenu, { defer: true }));
  /** What the last press on the column was made with: a finger's long press ends in a `contextmenu`. */
  let pressed: string | null = null;
  /** Opens a lane's palette where it was asked for, or leaves it to the hold when a finger asked. */
  const openLaneMenu = (own: LaneKey, e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    const lane = e.currentTarget;
    if (!(lane instanceof HTMLElement)) return;
    const source = e instanceof MouseEvent ? contextSourceOf(e.button, pressed) : 'keyboard';
    const point = e instanceof MouseEvent ? { x: e.clientX, y: e.clientY } : { x: 0, y: 0 };
    const anchor = laneMenuAnchor(source, point.x, point.y, lane.getBoundingClientRect());
    if (anchor) setMenu({ own, anchor: lane, at: anchor });
  };
  /** Opens the palette that adds a lane, upward from the click or from the button's corner. */
  const openAdd = (e: MouseEvent) => {
    const button = e.currentTarget;
    if (!(button instanceof HTMLElement)) return;
    const source = clickSourceOf(e.detail);
    const at = addMenuAnchor(source, e.clientX, e.clientY, button.getBoundingClientRect());
    setMenu({ own: null, anchor: button, at });
  };
  /** Brings a lane into view and gives it the focus; with none, + LANE. */
  const reveal = (lane: LaneKey | null) => {
    const el = (lane && lanes.get(lane)) || add;
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    el.focus({ preventScroll: true });
  };
  const pick = (lane: LaneKey) => {
    const m = menu();
    if (!m) return;
    closeMenu();
    take(m.own, lane);
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
  /** What a lane reads at the cursor, as the chip lifted with it shows; nothing of an instrument. */
  const liftValue = (lane: LaneKey): string | null => {
    if (isInstrumentLane(lane)) return null;
    const a = at();
    return a ? readoutOf(readingsIn(lane), a).value : NONE.v;
  };
  const heights = () => plotted().map((k) => lanes.get(k)?.offsetHeight ?? 0);
  const { drag, swipe, peeking, pinchable, drop, grab } = createLaneDrag({
    scroller,
    picker: {
      open: (lane, el, fx, fy) =>
        setMenu({ own: lane, anchor: el, at: { x: fx, y: fy, up: false } }),
      close: closeMenu,
    },
    bin: () => add,
    heights,
    lanes: plotted,
    onTap: (tap) => {
      const double = isDoubleTap(lastTap, tap);
      if (double) reset();
      lastTap = double ? null : tap;
    },
    peek: { move: (clientX) => setHoverPx(plotPx(clientX)), end: () => setHoverPx(null) },
    select: {
      start: (clientX) => setPressedAt(timeAt(plotPx(clientX), visible(), plotWidth())),
      move: (clientX) => setHoverPx(plotPx(clientX)),
      end: () => {
        const t0 = pressedAt();
        const px = hoverPx();
        if (t0 !== null && px !== null) {
          const t1 = timeAt(px, visible(), plotWidth());
          setLanesWindow(hex(), selectWindow(t0, t1, visible(), contact()));
        }
        stopSelecting();
      },
      cancel: stopSelecting,
    },
    onDrop: (lane, place) => {
      if (place === 'remove') {
        movesOf(lane).onRemove();
        return;
      }
      movePlotLane(place.move, place.to);
      reveal(lane);
    },
  });
  createWindowInput({
    scroller,
    plotLeft,
    pinchable,
    drop,
    plotWidth,
    window: lanesWindow,
    visible,
    contact,
    setWindow: (w) => setLanesWindow(hex(), w),
  });
  /** The drag once the lane is off its place: not while a finger has only lifted it. */
  const moving = () => {
    const d = drag();
    return d && !d.still ? d : null;
  };
  /** How far the axis stands off its place: while a lane is dragged it stays where it was. */
  const axisOffset = () => {
    const d = drag();
    return d
      ? axisShift(
          heights(),
          d.from,
          slotShown(d.from, d.slot, d.overBin),
          lastHistoryIndex(plotted()),
        )
      : 0;
  };
  const restoreScroll = () => {
    const el = scroller();
    if (!el) return;
    el.scrollTop = lanesView(hex()).scrollTop;
    measure();
  };
  createEffect(on(hex, restoreScroll, { defer: true }));
  // Lanes come and go, which changes how far they scroll.
  createEffect(() => {
    plotted();
    measure();
  });
  // So does the scroller's own size, which is none while the panel is hidden; a hidden scroller drops
  // the scroll it is given, so it gets the kept one back once it has a size again.
  createEffect(() => {
    const el = scroller();
    if (!el) return;
    let sized = false;
    const observer = new ResizeObserver(() => {
      const shown = el.clientHeight > 0;
      if (shown && !sized) restoreScroll();
      else measure();
      sized = shown;
    });
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      data-lanes
      class={cx(s.lanes, drag() && s.grabbing)}
      style={{
        '--lift-ms': `${MENU_HOLD_MS - HOLD_MS}ms`,
      }}
    >
      <div ref={setBay} class={s.bay}>
        <div class={cx(s.viewport, view().cutTop && s.cutTop, view().cutBottom && s.cutBottom)}>
          <div
            ref={setScroller}
            class={s.scroller}
            onScroll={(e) => {
              setLaneScroll(hex(), e.currentTarget.scrollTop);
              measure();
            }}
            onPointerMove={pointerAt}
            onPointerDown={(e) => {
              pressed = e.pointerType;
            }}
            onPointerLeave={() => setHoverPx(null)}
          >
            <For each={plotted()}>
              {(lane, i) => {
                onCleanup(() => lanes.delete(lane));
                const placed = () => {
                  const d = drag();
                  return d ? placeOf(i(), d.from, slotShown(d.from, d.slot, d.overBin)) : i();
                };
                return isInstrumentLane(lane) ? (
                  <InstrumentLane
                    lane={lane}
                    track={props.track}
                    moment={moment()}
                    index={i()}
                    count={plotted().length}
                    laneRef={(el) => lanes.set(lane, el)}
                    moves={movesOf(lane)}
                    onMenu={(e) => openLaneMenu(lane, e)}
                    onGrab={(e, part) => grab(e, lane, part)}
                    place={placed()}
                    slot={moving()?.lane === lane}
                    lifted={drag()?.lane === lane && drag()?.still === true}
                  />
                ) : (
                  <Lane
                    lane={lane}
                    index={i()}
                    count={plotted().length}
                    keys={readingsIn(lane)}
                    samples={samples()}
                    visible={visible()}
                    gaps={gaps()}
                    ticks={tickTimes()}
                    width={plotWidth()}
                    height={LANE_PX}
                    at={at()}
                    past={past()}
                    cursor={cursorX()}
                    band={band()}
                    onReset={reset}
                    onWindowKey={(key) => {
                      const w = lanesWindow();
                      const next = keyWindow(key, w, visible(), contact());
                      if (next !== w) setLanesWindow(hex(), next);
                    }}
                    laneRef={(el) => lanes.set(lane, el)}
                    moves={movesOf(lane)}
                    onMenu={(e) => openLaneMenu(lane, e)}
                    onGrab={(e, part) => grab(e, lane, part)}
                    place={placed()}
                    slot={moving()?.lane === lane}
                    lifted={drag()?.lane === lane && drag()?.still === true}
                    swipeX={(() => {
                      const sw = swipe();
                      return sw?.lane === lane ? swipeOffset(sw.dx) : null;
                    })()}
                  />
                );
              }}
            </For>
            <Show when={lastHistoryIndex(plotted()) >= 0}>
              <TimeAxis
                ticks={tickTimes()}
                x={x}
                width={plotWidth()}
                now={now()}
                window={lanesWindow()}
                lag={now() - visible().to}
                order={lastHistoryIndex(plotted())}
                shift={axisOffset()}
                rowRef={setAxisRow}
              />
            </Show>
            <div class={s.addRow} style={{ order: plotted().length }}>
              <button
                ref={(el) => {
                  add = el;
                }}
                type="button"
                class={cx(s.add, moving() && s.bin)}
                aria-haspopup="dialog"
                aria-expanded={menu()?.anchor === add}
                onClick={openAdd}
              >
                <Show when={moving()} fallback="+ LANE">
                  {(d) => (
                    <>
                      <svg class={s.binIcon} viewBox="0 0 10 12" aria-hidden="true">
                        <path d="M0.5 2.5 H9.5 M3.5 2.5 V0.5 H6.5 V2.5 M1.5 2.5 L2 11.5 H8 L8.5 2.5" />
                      </svg>
                      RELEASE TO REMOVE {LANE_LABELS[d().lane]}
                    </>
                  )}
                </Show>
              </button>
            </div>
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
        <Show when={moving()}>
          {(d) => {
            let lift: HTMLDivElement | undefined;
            const left = () =>
              liftLeft(
                d().x - (bayBox()?.left ?? 0),
                Math.min(d().grabX, lift?.offsetWidth ?? 0),
                bayBox()?.width ?? 0,
                lift?.offsetWidth ?? 0,
              );
            return (
              <div
                ref={(el) => {
                  lift = el;
                }}
                class={s.lift}
                style={{
                  left: `${left()}px`,
                  top: `${d().y - (bayBox()?.top ?? 0) - LIFT_GAP_PX}px`,
                }}
              >
                <span class={s.name}>{LANE_LABELS[d().lane]}</span>
                <Show when={liftValue(d().lane)}>
                  {(value) => <span class={s.liftValue}>{value()}</span>}
                </Show>
              </div>
            );
          }}
        </Show>
        <Show when={menu()}>
          {(m) => (
            <Portal>
              <Palette
                own={m().own}
                plotted={plotted()}
                at={m().at}
                anchor={m().anchor}
                clip={scroller()?.getBoundingClientRect()}
                moves={(() => {
                  const own = m().own;
                  return own === null ? undefined : movesOf(own);
                })()}
                onPick={pick}
                onClose={closeMenu}
              />
            </Portal>
          )}
        </Show>
      </div>
    </div>
  );
}
