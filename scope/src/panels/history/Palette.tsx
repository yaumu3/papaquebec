import { For, onCleanup, onMount, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { LANE_GROUPS, type LaneKey } from '../../state/plotted';
import { reorderKey } from '../../ui/reorder';
import { READINGS } from '../readings';
import { chipOf } from './chips';

import s from './Palette.module.css';

/** What the LANE row of a lane's palette can do to it. */
export interface LaneMoves {
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}

/**
 * The lanes by group as chips, to switch the lane `own` to another or, with none, to add one;
 * under a rule, a lane's own row of moves.
 */
export function Palette(props: {
  own: LaneKey | null;
  plotted: readonly LaneKey[];
  /** Where it stands down the bay, under its anchor. */
  top: number;
  /** The control that opened it, which a click on leaves to itself. */
  anchor: HTMLElement;
  moves?: LaneMoves | undefined;
  onPick: (lane: LaneKey) => void;
  onClose: () => void;
}) {
  let el!: HTMLDivElement;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    // Read before closing, which unmounts the palette and its props with it.
    const anchor = props.anchor;
    props.onClose();
    anchor.focus();
  };
  const onPointerDown = (e: PointerEvent) => {
    const t = e.target;
    if (t instanceof Node && (el.contains(t) || props.anchor.contains(t))) return;
    props.onClose();
  };
  onMount(() => {
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    const own = el.querySelector<HTMLButtonElement>('[aria-current="true"]');
    (own ?? el.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    window.removeEventListener('pointerdown', onPointerDown, { capture: true });
  });

  return (
    <div
      ref={(e) => {
        el = e;
      }}
      class={s.palette}
      style={{ top: `${props.top}px` }}
      onKeyDown={(e) => {
        const m = props.moves;
        const ask = reorderKey(e);
        if (!m || ask === null) return;
        e.preventDefault();
        e.stopPropagation();
        if (ask === 'up' && !m.first) m.onUp();
        else if (ask === 'down' && !m.last) m.onDown();
        else if (ask === 'remove') m.onRemove();
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
                      onClick={() => props.onPick(lane)}
                    >
                      <Show when={chip() === 'open'}>
                        <span class={s.dot} />
                      </Show>
                      {READINGS[lane].label}
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
  );
}
