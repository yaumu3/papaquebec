import type { JSX } from 'solid-js';

import { cx } from '../design/cx';
import { activeSheet, closeSheet, isPhone, isShown } from '../state/layout';
import { type PanelId, panels } from '../state/scope';
import { trackGrip } from './grip';

import s from './Window.module.css';

/** The handle of a phone's sheet: a tap or a pull down closes the sheet. */
function Grip() {
  const grip = trackGrip(closeSheet);
  return (
    <button
      type="button"
      class={s.grip}
      aria-label="Close the sheet"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        grip.down(e.clientY);
      }}
      onPointerUp={(e) => grip.up(e.clientY)}
      onClick={() => grip.click()}
    >
      <span class={s.handle} />
    </button>
  );
}

/** A docked panel. Desktop visibility comes from the top bar toggles, phone visibility from the sheet. */
export function Window(props: {
  id: PanelId;
  class?: string | undefined;
  bodyClass?: string | undefined;
  children: JSX.Element;
}) {
  const shown = () => isShown(isPhone(), activeSheet(), props.id, panels()[props.id]);
  return (
    <div class={cx(s.win, props.class, !shown() && s.hidden)}>
      <Grip />
      <div class={cx(s.body, props.bodyClass)}>{props.children}</div>
    </div>
  );
}
