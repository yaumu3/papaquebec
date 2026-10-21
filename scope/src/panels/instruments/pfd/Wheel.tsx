import { Index, type JSX } from 'solid-js';

import { cx } from '../../../design/cx';
import { type WheelCell, columnTop } from './geometry';
import type { Wheel as WheelData } from './wheels';

import s from './Pfd.module.css';

interface WheelProps<T> {
  cell: WheelCell;
  wheel: WheelData<T>;
  /** What a row shows; its text by default. */
  row?: (row: T) => JSX.Element;
  /** The font of the rows. */
  class: string | undefined;
}

/** A digit wheel: its rows in a clipped window, the column turned by the wheel's fraction of a row. */
export function Wheel<T = string>(props: WheelProps<T>) {
  const top = () => columnTop(props.cell, props.wheel.turned);
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
          {(row) => (
            <div style={{ height: `${props.cell.lineH}px` }}>
              {props.row ? props.row(row()) : String(row())}
            </div>
          )}
        </Index>
      </div>
    </div>
  );
}
