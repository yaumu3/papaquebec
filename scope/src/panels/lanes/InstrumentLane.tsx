import { Match, Switch } from 'solid-js';

import { cx } from '../../design/cx';
import type { InstrumentLane as InstrumentKey } from '../../state/plotted';
import type { Track } from '../../state/track';
import type { Moment } from '../instruments/moment';
import { Nd } from '../instruments/nd/Nd';
import { Pfd } from '../instruments/pfd/Pfd';
import { Surv } from '../instruments/surv/Surv';
import { laneName } from './chips';
import type { LanePart } from './laneDrag';
import { type LaneMoves, onMoveKey } from './moves';
import { isPickerKey } from './pickerPlace';

import s from './Lanes.module.css';

/** A lane of the column that holds an instrument: as tall as it is, with no top row of its own. */
export function InstrumentLane(props: {
  lane: InstrumentKey;
  track: Track;
  /** What the instruments draw: now, the sample the lanes read, or nothing where they read none. */
  moment: Moment;
  /** Its place among the lanes, and how many there are. */
  index: number;
  count: number;
  /** The lane itself, which keeps the focus for it. */
  laneRef: (el: HTMLDivElement) => void;
  moves: LaneMoves;
  /** What asks for the lane's palette. */
  onMenu: (e: MouseEvent | KeyboardEvent) => void;
  onGrab: (e: PointerEvent, part: LanePart) => void;
  /** Where it stands among the lanes while one is dragged. */
  place: number;
  /** Whether it is the lane dragged, shown as a hole where it will land. */
  hole: boolean;
  /** Whether a finger has lifted it and not moved it yet: lit where it stands. */
  lifted: boolean;
}) {
  return (
    <div
      ref={props.laneRef}
      data-lane="instrument"
      class={cx(s.lane, s.instrument, props.hole && s.hole, props.lifted && s.lifted)}
      style={{ order: props.place }}
      tabindex="0"
      role="group"
      aria-roledescription="lane"
      aria-label={laneName(props.lane, props.index, props.count)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (isPickerKey(e)) props.onMenu(e);
        else onMoveKey(props.moves, e);
      }}
      onContextMenu={props.onMenu}
      onPointerDown={(e) => props.onGrab(e, 'instrument')}
    >
      <Switch>
        <Match when={props.lane === 'pfd'}>
          <Pfd t={props.track} moment={props.moment} />
        </Match>
        <Match when={props.lane === 'nd'}>
          <Nd t={props.track} moment={props.moment} />
        </Match>
        <Match when={props.lane === 'surv'}>
          <Surv t={props.track} moment={props.moment} />
        </Match>
      </Switch>
    </div>
  );
}
