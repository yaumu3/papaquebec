import type { JSX } from 'solid-js';

import { cx } from '../../design/cx';
import { isInstrumentLane, type LaneKey } from '../../state/plotted';
import type { WindowKey } from '../../state/window';
import { laneName } from './chips';
import type { LanePart } from './laneDrag';
import { type LaneMoves, onMoveKey, windowKeyOf } from './moves';
import { isPickerKey } from './pickerPlace';
import { areaOf } from './windowInput';

import s from './Lanes.module.css';

/**
 * What a lane of the column has in common whatever it draws: the box that takes the focus, the
 * keys, the picker, the grab, and its place among the lanes while one is dragged. A history lane
 * also gives its height, what a double click does, and what the window keys do.
 */
export function LaneFrame(props: {
  lane: LaneKey;
  /** Its place among the lanes, and how many there are. */
  index: number;
  count: number;
  /** The lane itself, which keeps the focus for it. */
  laneRef: (el: HTMLDivElement) => void;
  moves: LaneMoves;
  /** What asks for the lane's picker. */
  onPicker: (e: MouseEvent | KeyboardEvent) => void;
  onGrab: (e: PointerEvent, part: LanePart) => void;
  /** Where it stands among the lanes while one is dragged. */
  place: number;
  /** Whether it is the lane dragged, shown as a hole where it will land. */
  hole: boolean;
  /** Whether a finger has lifted it and not moved it yet: lit where it stands. */
  lifted: boolean;
  height?: number;
  /** Resets the window, as a double click on the lane does. */
  onReset?: (() => void) | undefined;
  /** Pans, narrows, widens or resets the window, as a key on the lane asks. */
  onWindowKey?: ((key: WindowKey) => void) | undefined;
  children: JSX.Element;
}) {
  const instrument = () => isInstrumentLane(props.lane);
  return (
    <div
      ref={props.laneRef}
      data-lane={instrument() ? 'instrument' : 'history'}
      class={cx(
        s.lane,
        instrument() && s.instrument,
        props.hole && s.hole,
        props.lifted && s.lifted,
      )}
      style={
        instrument() ? { order: props.place } : { height: `${props.height}px`, order: props.place }
      }
      tabindex="0"
      role="group"
      aria-roledescription="lane"
      aria-label={laneName(props.lane, props.index, props.count)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const key = props.onWindowKey && windowKeyOf(e);
        if (isPickerKey(e)) props.onPicker(e);
        else if (key) {
          e.preventDefault();
          e.stopPropagation();
          props.onWindowKey?.(key);
        } else onMoveKey(props.moves, e);
      }}
      onContextMenu={props.onPicker}
      onDblClick={props.onReset}
      onPointerDown={(e) =>
        props.onGrab(e, instrument() ? 'instrument' : areaOf(e.target) === 'row' ? 'row' : 'plot')
      }
    >
      {props.children}
    </div>
  );
}
