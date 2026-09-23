import type { JSX } from 'solid-js';

import s from './Field.module.css';

export function FieldRow(props: { children: JSX.Element }) {
  return <div class={s.row}>{props.children}</div>;
}

/** A labeled input; the caller supplies the input element. */
export function Field(props: { label: string; children: JSX.Element }) {
  return (
    <label class={s.field}>
      <span class={s.label}>{props.label}</span>
      {props.children}
    </label>
  );
}

/** A label-only slot for a control that is not an input, aligned with `Field`. */
export function FieldSlot(props: { label: string; children: JSX.Element }) {
  return (
    <div class={s.field}>
      <span class={s.label}>{props.label}</span>
      {props.children}
    </div>
  );
}
