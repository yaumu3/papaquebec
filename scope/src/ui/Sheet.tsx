import type { JSX } from 'solid-js';

import { closeSheet } from '../state/layout';
import { trackGrip } from './grip';

import s from './Sheet.module.css';

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

/** On a phone, a bottom sheet under a grip; elsewhere a plain box. */
export function Sheet(props: { class?: string | undefined; children: JSX.Element }) {
  return (
    <div class={props.class}>
      <Grip />
      {props.children}
    </div>
  );
}
