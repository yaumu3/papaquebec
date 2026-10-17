import { Index } from 'solid-js';

import { cx } from '../../../design/cx';
import { type Wheel as WheelData, type WheelCell, wheelTop } from './geometry';

import s from './Pfd.module.css';

interface WheelProps {
  cell: WheelCell;
  wheel: WheelData;
  /** The font of the rows. */
  class: string | undefined;
}

/** A digit wheel: its rows in a clipped window, the column turned by the wheel's fraction of a row. */
export function Wheel(props: WheelProps) {
  const top = () => wheelTop(props.cell.h, props.cell.lineH, props.cell.above, props.wheel.turned);
  return (
    <div
      class={s.wheel}
      style={{
        left: `${props.cell.x}px`,
        top: `${props.cell.y}px`,
        width: `${props.cell.w}px`,
        height: `${props.cell.h}px`,
      }}
    >
      <div
        class={cx(s.wheelRows, props.class)}
        style={{ top: `${top()}px`, 'line-height': `${props.cell.lineH}px` }}
      >
        <Index each={props.wheel.rows}>
          {(row) => <div style={{ height: `${props.cell.lineH}px` }}>{row()}</div>}
        </Index>
      </div>
    </div>
  );
}
