import type { JSX } from 'solid-js';

import { cx } from '../design/cx';
import { activeSheet, isPhone } from '../state/layout';
import { type PanelId, panels } from '../state/scope';

import s from './Window.module.css';

/** A docked panel. Desktop visibility comes from the top bar toggles, phone visibility from the sheet. */
export function Window(props: {
  id: PanelId;
  title: JSX.Element;
  class?: string | undefined;
  bodyClass?: string | undefined;
  children: JSX.Element;
}) {
  const shown = () => (isPhone() ? activeSheet() === props.id : panels()[props.id]);
  return (
    <div class={cx(s.win, props.class, !shown() && s.hidden)}>
      <div class={s.titlebar}>{props.title}</div>
      <div class={cx(s.body, props.bodyClass)}>{props.children}</div>
    </div>
  );
}
