import type { JSX } from 'solid-js';

import s from './Section.module.css';

/** Dim uppercase heading inside a panel. */
export function SectionTitle(props: { children: JSX.Element }) {
  return <div class={s.title}>{props.children}</div>;
}

/** A one-line control with its dim label in a fixed column on the left. */
export function LabeledRow(props: { label: string; children: JSX.Element }) {
  return (
    <div class={s.row}>
      <span class={s.rowLabel}>{props.label}</span>
      {props.children}
    </div>
  );
}

export function Divider() {
  return <div class={s.divider} />;
}
