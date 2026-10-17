import { cx } from '../../../design/cx';

import flags from '../flag.module.css';
import s from './Pfd.module.css';

/** The flag of a value that does not hold, centred on (x, y). */
export function Flag(props: { text: string; x: number; y: number }) {
  return (
    <span class={cx(flags.flag, s.flag)} style={{ left: `${props.x}px`, top: `${props.y}px` }}>
      {props.text}
    </span>
  );
}
