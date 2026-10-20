import { For, onCleanup, onMount, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { LANE_GROUPS, type LaneKey } from '../../state/plotted';
import { wrapIndex } from '../../ui/wrap';
import { LANE_LABELS } from '../readings';
import { chipName, chipOf, paletteName } from './chips';
import { type Box, clipBox } from './drag';
import { type PaletteAnchor, paletteBox } from './menu';
import { type LaneMoves, onMoveKey } from './moves';

import s from './Palette.module.css';

/**
 * The lanes by group as chips, to switch the lane `own` to another or, with none, to add one;
 * under a rule, a lane's own row of moves. It floats over the page at a point, kept inside the
 * window, with the rest of the page dimmed but what it is for.
 */
export function Palette(props: {
  own: LaneKey | null;
  plotted: readonly LaneKey[];
  /** The point it stands at. */
  at: PaletteAnchor;
  /** The control that opened it, which stands lit and gets the focus back. */
  anchor: HTMLElement;
  /** Where the page shows the anchor, which only its part inside stands lit. */
  clip?: Box | undefined;
  moves?: LaneMoves | undefined;
  onPick: (lane: LaneKey) => void;
  onClose: () => void;
}) {
  let el!: HTMLDivElement;
  /** Closes it and gives the focus back to what it is for. */
  const close = () => {
    // Read before closing, which unmounts the palette and its props with it.
    const anchor = props.anchor;
    props.onClose();
    anchor.focus({ preventScroll: true });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  /** Tabs round the palette's buttons, as a dialog keeps the focus to itself. */
  const tabRound = (e: KeyboardEvent) => {
    const stops = [...el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (stops.length === 0) return;
    e.preventDefault();
    const at = stops.findIndex((b) => b === document.activeElement);
    stops[wrapIndex(at, stops.length, e.shiftKey)]?.focus();
  };
  /** Whatever scrolls closes it, which a point in the window would no longer fit. */
  const onScroll = (e: Event) => {
    if (!(e.target instanceof Node && el.contains(e.target))) close();
  };
  /** The mouse events that follow a touch would move the focus to the page. */
  const keepFocus = (e: MouseEvent) => e.preventDefault();
  /** What it is for, which stands lit. */
  const anchorBox = props.anchor.getBoundingClientRect();
  const lit = props.clip ? clipBox(anchorBox, props.clip) : anchorBox;
  /** Stands it at its anchor, written straight to the element so that it takes the focus at once. */
  const place = () => {
    const box = paletteBox(
      props.at,
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
  };
  onMount(() => {
    place();
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('scroll', onScroll, { capture: true });
    const own = el.querySelector<HTMLButtonElement>('[aria-current="true"]');
    (own ?? el.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    window.removeEventListener('scroll', onScroll, { capture: true });
  });

  return (
    <>
      <div
        class={s.backdrop}
        onMouseDown={keepFocus}
        onPointerDown={(e) => {
          // Cancelled, so that the mouse events that follow do not take the focus from the lane.
          e.preventDefault();
          close();
        }}
        onWheel={close}
        onContextMenu={(e) => {
          e.preventDefault();
          close();
        }}
      />
      <div
        class={s.spotlight}
        style={{
          left: `${lit.left}px`,
          top: `${lit.top}px`,
          width: `${lit.right - lit.left}px`,
          height: `${lit.bottom - lit.top}px`,
        }}
      />
      <div
        ref={(e) => {
          el = e;
        }}
        data-lanes
        class={s.palette}
        role="dialog"
        aria-modal="true"
        onMouseDown={keepFocus}
        aria-label={paletteName(props.own)}
        onKeyDown={(e) => {
          if (e.key === 'Tab') tabRound(e);
          else if (props.moves) onMoveKey(props.moves, e);
        }}
      >
        <For each={LANE_GROUPS}>
          {(group) => (
            <>
              <span class={s.name}>{group.name}</span>
              <div class={s.chips}>
                <For each={group.lanes}>
                  {(lane) => {
                    const chip = () => chipOf(props.plotted, props.own, lane);
                    return (
                      <button
                        type="button"
                        class={cx(
                          s.chip,
                          chip() === 'own' && s.own,
                          chip() === 'open' && s.elsewhere,
                        )}
                        aria-current={chip() === 'own' ? 'true' : undefined}
                        aria-label={chipName(lane, chip())}
                        onClick={() => props.onPick(lane)}
                      >
                        <Show when={chip() === 'open'}>
                          <span class={s.dot} aria-hidden="true" />
                        </Show>
                        {LANE_LABELS[lane]}
                      </button>
                    );
                  }}
                </For>
              </div>
            </>
          )}
        </For>
        <Show when={props.moves}>
          {(m) => (
            <>
              <hr class={s.rule} />
              <span class={s.name}>LANE</span>
              <div class={s.chips}>
                <span class={s.pair}>
                  <button
                    type="button"
                    class={s.chip}
                    disabled={m().first}
                    onClick={() => m().onUp()}
                  >
                    ↑ UP <span class={s.key}>ALT+↑</span>
                  </button>
                  <button
                    type="button"
                    class={s.chip}
                    disabled={m().last}
                    onClick={() => m().onDown()}
                  >
                    ↓ DOWN <span class={s.key}>ALT+↓</span>
                  </button>
                </span>
                <button type="button" class={cx(s.chip, s.remove)} onClick={() => m().onRemove()}>
                  REMOVE <span class={s.key}>DEL</span>
                </button>
              </div>
            </>
          )}
        </Show>
      </div>
    </>
  );
}
