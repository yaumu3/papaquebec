import { createMemo, createSignal, Show } from 'solid-js';

import { cx } from '../../../design/cx';
import { settings } from '../../../state/settings';
import type { Track } from '../../../state/track';
import { trackWidth } from '../../../ui/size';
import { glided } from '../glide';
import { lostAt, type Moment, momentKey } from '../moment';
import { AltitudeMarks, AltitudeText, altitudeView, targetOf } from './AltitudeTape';
import { AttitudeMarks, AttitudeText, attitudeView } from './Attitude';
import { FlagsShown } from './Flag';
import { FmaMarks, FmaText } from './Fma';
import { pfdGeometry, vsiScale } from './geometry';
import { feetOf, pfdFma, pfdReadouts } from './readout';
import { SpeedMarks, SpeedText, speedView } from './SpeedTape';
import { needleView, VsiMarks, VsiText } from './Vsi';

import s from './Pfd.module.css';

/** The primary flight display of a target: its modes, speed, attitude, altitude and vertical speed. */
export function Pfd(props: { t: Track; moment: Moment }) {
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const width = trackWidth(root);
  const g = createMemo(() => pfdGeometry(width()));
  const lost = createMemo(() => lostAt(props.moment));
  const r = createMemo(() => pfdReadouts(props.moment, settings.altimeter));
  const fma = createMemo(() => pfdFma(props.moment, props.t.samples));
  const key = () => `${props.t.hex}/${momentKey(props.moment)}`;
  const ias = glided(() => r().ias, { key });
  const feet = glided(() => feetOf(r().altitude), { key });
  const vs = glided(() => r().vs, { key });
  const speed = createMemo(() => speedView(g(), ias()));
  const attitude = createMemo(() => attitudeView(g(), r()));
  const altitude = createMemo(() => altitudeView(g(), feet()));
  const sel = createMemo(() => targetOf(r().selAlt));
  const fms = createMemo(() => targetOf(r().fmsAlt));
  const needle = createMemo(() => needleView(g(), vs(), r().vs));
  const scale = createMemo(() => vsiScale(g()));
  return (
    <div
      data-pfd
      ref={setRoot}
      class={cx(s.pfd, lost() && s.last)}
      style={{ height: `${g().h}px` }}
    >
      <Show when={width() > 0}>
        <svg class={s.svg} aria-hidden="true">
          <AttitudeMarks g={g()} view={attitude()} />
          <SpeedMarks g={g()} view={speed()} />
          <AltitudeMarks g={g()} read={r().altitude} view={altitude()} sel={sel()} fms={fms()} />
          <VsiMarks g={g()} scale={scale()} needle={needle()} />
          <FmaMarks g={g()} />
        </svg>
        <FlagsShown when={props.moment.kind !== 'empty'}>
          <AttitudeText g={g()} view={attitude()} />
          <SpeedText g={g()} view={speed()} mach={r().mach} />
          <AltitudeText
            g={g()}
            read={r().altitude}
            view={altitude()}
            sel={sel()}
            fms={fms()}
            baro={r().baro}
          />
        </FlagsShown>
        <VsiText scale={scale()} needle={needle()} />
        <FmaText g={g()} fma={fma()} />
      </Show>
    </div>
  );
}
