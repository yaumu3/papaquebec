import type { JSX } from 'solid-js';

import { cx } from '../design/cx';
import { activeSheet, isPhone, isShown } from '../state/layout';
import { type PanelId, panels } from '../state/scope';
import { Sheet } from './Sheet';

import s from './Window.module.css';

/** A docked panel. Desktop visibility comes from the top bar toggles, phone visibility from the sheet. */
export function Window(props: {
  id: PanelId;
  class?: string | undefined;
  bodyClass?: string | undefined;
  children: JSX.Element;
}) {
  const shown = () => isShown(isPhone(), activeSheet(), props.id, panels()[props.id]);
  return (
    <Sheet class={cx(s.win, props.class, !shown() && s.hidden)}>
      <div class={cx(s.body, props.bodyClass)}>{props.children}</div>
    </Sheet>
  );
}
