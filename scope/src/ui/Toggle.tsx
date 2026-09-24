import { cx } from '../design/cx';

import s from './Toggle.module.css';

export function Toggle(props: {
  label: string;
  on: boolean;
  onToggle: () => void;
  class?: string | undefined;
}) {
  return (
    <button
      type="button"
      class={cx(s.toggle, props.class, props.on && s.on)}
      onClick={() => props.onToggle()}
    >
      {props.label}
    </button>
  );
}
