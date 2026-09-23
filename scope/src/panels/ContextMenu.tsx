import { createEffect, For, Show } from 'solid-js';

import { cx } from '../design/cx';
import { menu, setMenu } from '../state/scope';

import s from './ContextMenu.module.css';

export function ContextMenu() {
  let el: HTMLDivElement | undefined;
  createEffect(() => {
    const m = menu();
    if (!m || !el) return;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.min(m.x, window.innerWidth - r.width - 8)}px`;
    el.style.top = `${Math.min(m.y, window.innerHeight - r.height - 8)}px`;
  });
  return (
    <Show when={menu()}>
      {(m) => (
        <div
          class={s.menu}
          data-menu
          ref={(node) => {
            el = node;
          }}
        >
          <For each={m().items}>
            {(it) => (
              <Show when={!it.separator} fallback={<div class={s.sep} />}>
                <Show when={!it.header} fallback={<div class={s.header}>{it.label}</div>}>
                  <button
                    type="button"
                    class={cx(s.item, it.disabled && s.disabled)}
                    disabled={it.disabled}
                    onClick={() => {
                      it.onSelect?.();
                      setMenu(null);
                    }}
                  >
                    <span>
                      {it.checked === undefined ? '' : it.checked ? '✓  ' : '   '}
                      {it.label}
                    </span>
                    <Show when={it.shortcut}>
                      <span class={s.shortcut}>{it.shortcut}</span>
                    </Show>
                  </button>
                </Show>
              </Show>
            )}
          </For>
        </div>
      )}
    </Show>
  );
}
