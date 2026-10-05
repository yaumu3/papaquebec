import { For } from 'solid-js';

import { Button } from './Button';

import s from './Pills.module.css';

export interface PillOption<T> {
  value: T;
  label: string;
}

/** A row of buttons of which the one holding `value` is on. */
export function Pills<T extends string | number>(props: {
  options: readonly PillOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div class={s.pills}>
      <For each={props.options}>
        {(o) => (
          <Button
            class={s.pill}
            on={o.value === props.value}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </Button>
        )}
      </For>
    </div>
  );
}
