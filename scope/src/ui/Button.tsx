import type { JSX } from 'solid-js';

import { cx } from '../design/cx';

import s from './Button.module.css';

/** The one button of the chrome, filled while `on`. */
export function Button(props: {
  on?: boolean;
  class?: string | undefined;
  /** Read out in place of the content, for a button that shows a glyph. */
  label?: string;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class={cx(s.button, props.class, props.on && s.on)}
      aria-label={props.label}
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  );
}
