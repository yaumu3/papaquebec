import { type Accessor, createContext, type JSX, Show, useContext } from 'solid-js';

import { cx } from '../../../design/cx';

import flags from '../flag.module.css';
import s from './Pfd.module.css';

const Shown = createContext<Accessor<boolean>>(() => true);

/** Whether the flags under it are drawn: not over a gap, where the instrument shows nothing. */
export function FlagsShown(props: { when: boolean; children: JSX.Element }) {
  return <Shown.Provider value={() => props.when}>{props.children}</Shown.Provider>;
}

/** The flag of a value that does not hold, centred on (x, y). */
export function Flag(props: { text: string; x: number; y: number }) {
  const shown = useContext(Shown);
  return (
    <Show when={shown()}>
      <span class={cx(flags.flag, s.flag)} style={{ left: `${props.x}px`, top: `${props.y}px` }}>
        {props.text}
      </span>
    </Show>
  );
}
