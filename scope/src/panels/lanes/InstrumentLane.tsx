import { Match, Switch } from 'solid-js';

import type { InstrumentLane as InstrumentKey } from '../../state/plotted';
import type { Track } from '../../state/track';
import type { Moment } from '../instruments/moment';
import { Nd } from '../instruments/nd/Nd';
import { Pfd } from '../instruments/pfd/Pfd';
import { Surv } from '../instruments/surv/Surv';

/** A lane of the column that holds an instrument: as tall as it is, with no top row of its own. */
export function InstrumentLane(props: {
  lane: InstrumentKey;
  track: Track;
  /** What the instruments draw: now, the sample the lanes read, or nothing where they read none. */
  moment: Moment;
}) {
  return (
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
  );
}
