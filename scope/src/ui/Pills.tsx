import { For } from 'solid-js';

import { cx } from '../design/cx';

import s from './Pills.module.css';

export interface PillOption<T> {
  value: T;
  label: string;
}

export function Pills<T extends string | number>(props: {
  options: readonly PillOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div class={s.pills}>
      <For each={props.options}>
        {(o) => (
          <button
            type="button"
            class={cx(s.pill, props.small && s.small, o.value === props.value && s.active)}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}
