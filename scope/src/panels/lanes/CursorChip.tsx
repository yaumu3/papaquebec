import { createSignal, type JSX } from 'solid-js';

import { trackWidth } from '../../ui/size';
import { chipAt } from './axis';

import s from './Lanes.module.css';

/** The chip's padding either side of what it reads. */
const CHIP_PAD_PX = 3;
/** The notch under the chip, pointing down the cursor line. */
const NOTCH_W_PX = 7;
const NOTCH_H_PX = 4;

/** A lane's readout at the cursor in a chip with a notch under it, kept inside the plot it floats over. */
export function CursorChip(props: {
  /** Where the cursor line stands across the plot. */
  px: number;
  /** How wide the plot is. */
  width: number;
  children: JSX.Element;
}) {
  const [body, setBody] = createSignal<HTMLSpanElement>();
  const bodyWidth = trackWidth(body);
  const chipWidth = () => bodyWidth() + 2 * (CHIP_PAD_PX + 1);

  return (
    <>
      <svg
        class={s.notch}
        style={{ left: `${props.px - NOTCH_W_PX / 2}px` }}
        width={NOTCH_W_PX}
        height={NOTCH_H_PX}
      >
        <path d={`M0 0 H${NOTCH_W_PX} L${NOTCH_W_PX / 2} ${NOTCH_H_PX} Z`} />
      </svg>
      <span
        class={s.chip}
        style={{
          left: `${chipAt(props.px, chipWidth(), props.width)}px`,
          padding: `0 ${CHIP_PAD_PX}px`,
        }}
      >
        <span ref={setBody} class={s.chipBody}>
          {props.children}
        </span>
      </span>
    </>
  );
}
