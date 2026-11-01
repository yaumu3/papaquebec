import { createEffect, createMemo, type JSX, on } from 'solid-js';

import { cx } from '../design/cx';
import { activeSheet, DETENTS, isPhone, isShown } from '../state/layout';
import { type PanelId, panels } from '../state/scope';
import { Sheet } from './Sheet';

import s from './Window.module.css';

/** A docked panel. Desktop visibility comes from the top bar toggles, phone visibility from the sheet. */
export function Window(props: {
  id: PanelId;
  class?: string | undefined;
  bodyClass?: string | undefined;
  /** Called when the panel stops being shown. */
  onHide?: () => void;
  children: JSX.Element;
}) {
  const shown = createMemo(() => isShown(isPhone(), activeSheet(), props.id, panels()[props.id]));
  createEffect(
    on(
      shown,
      (now) => {
        if (!now) props.onHide?.();
      },
      { defer: true },
    ),
  );
  return (
    <Sheet detents={DETENTS[props.id]} shown={shown()} class={cx(s.win, props.class)}>
      <div class={cx(s.body, props.bodyClass)}>{props.children}</div>
    </Sheet>
  );
}
