import { Show } from 'solid-js';

import type { Reading } from './readings';

import s from './Value.module.css';

/**
 * A reading's value with its unit set apart. The host tones the value through `--value`, and the
 * unit through `--value-quiet`.
 */
export function Value(props: { r: Reading }) {
  return (
    <div class={s.v}>
      {props.r.v}
      <Show when={props.r.unit}>
        <span class={s.unit}>{props.r.unit}</span>
      </Show>
    </div>
  );
}
