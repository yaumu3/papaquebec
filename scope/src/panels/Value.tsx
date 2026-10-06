import { Show } from 'solid-js';

import type { Reading } from './readings';

import s from './Value.module.css';

/**
 * A reading's value with its unit, tail and second value set apart. The host tones the value
 * through `--value`, and the quieter parts round it through `--value-quiet`.
 */
export function Value(props: { r: Reading }) {
  return (
    <div class={s.v}>
      {props.r.v}
      <Show when={props.r.unit}>
        <span class={s.unit}>{props.r.unit}</span>
      </Show>
      <Show when={props.r.tail}>
        <span class={s.tail}>{props.r.tail}</span>
      </Show>
      <Show when={props.r.also}>
        <span class={s.sep}>·</span>
        <span class={s.also}>{props.r.also}</span>
        <Show when={props.r.alsoUnit}>
          <span class={s.unit}>{props.r.alsoUnit}</span>
        </Show>
      </Show>
    </div>
  );
}
