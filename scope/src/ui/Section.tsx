import { type JSX, Show } from 'solid-js';

import s from './Section.module.css';

/** Dim uppercase heading inside a panel, with an optional lit value beside it. */
export function SectionTitle(props: { children: JSX.Element; lit?: JSX.Element }) {
  return (
    <div class={s.title}>
      {props.children}
      <Show when={props.lit !== undefined}>
        &nbsp;&nbsp;<span class={s.lit}>{props.lit}</span>
      </Show>
    </div>
  );
}

export function Divider() {
  return <div class={s.divider} />;
}
