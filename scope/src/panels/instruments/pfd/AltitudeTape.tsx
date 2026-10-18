import { createUniqueId, Index, type JSX, Show } from 'solid-js';

import { Flag } from './Flag';
import {
  type AltitudeDigits,
  type AltitudeTape as AltitudeTapeMarks,
  altitudeBoxPath,
  altitudeDigits,
  altitudeReadout,
  altitudeStripPath,
  ALTITUDE_THOUSANDS_PX,
  altitudeTape,
  fmsLinePath,
  hatchStyle,
  type PfdGeometry,
  selBugPath,
  selClipRect,
  selDigits,
  type SlotRow,
} from './geometry';
import type { PfdAltitude } from './readout';
import { Wheel } from './Wheel';

import s from './Pfd.module.css';

/** The tape and the readout's digits, for an altitude in feet. */
export interface AltitudeView {
  ft: number;
  tape: AltitudeTapeMarks;
  digits: AltitudeDigits;
}

export function altitudeView(g: PfdGeometry, read: PfdAltitude): AltitudeView | undefined {
  if (read.kind !== 'feet') return undefined;
  return { ft: read.ft, tape: altitudeTape(g, read.ft), digits: altitudeDigits(read.ft) };
}

/** The hatch: stripes falling to the right, in a block centred in a digit cell, as tall as a capital. */
function Hatch() {
  const id = createUniqueId();
  const hatch = hatchStyle(ALTITUDE_THOUSANDS_PX);
  return (
    <svg
      class={s.hatch}
      style={{ left: `${hatch.left}px`, width: `${hatch.width}px` }}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={id}
          width={hatch.pitch}
          height="1"
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${hatch.angle})`}
        >
          <rect class={s.hatchInk} width={hatch.ink} height="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** What a slot row shows: its digit or the hatch; NEG stands apart, as the sign never rolls. */
const slotText = (row: SlotRow): JSX.Element => {
  if (row.kind === 'hatch') return <Hatch />;
  return row.kind === 'digit' ? row.text : '';
};

/** A target altitude in a box, so that a zero still tests as set. */
export interface Target {
  ft: number;
}

export const targetOf = (ft: number | undefined): Target | undefined =>
  ft === undefined ? undefined : { ft };

interface AltitudeProps {
  g: PfdGeometry;
  read: PfdAltitude;
  view: AltitudeView | undefined;
  sel: Target | undefined;
  fms: Target | undefined;
}

/** The strip; while the altitude is in feet its ticks, bars, FMS line and bug; the readout box. */
export function AltitudeMarks(props: AltitudeProps) {
  const bugClip = createUniqueId();
  return (
    <>
      <path class={s.strip} d={altitudeStripPath(props.g)} />
      <defs>
        <clipPath id={bugClip}>
          <rect {...selClipRect(props.g)} />
        </clipPath>
      </defs>
      <Show when={props.view}>
        {(v) => (
          <>
            <path class={s.ticks} d={v().tape.ticks} />
            <path class={s.bars} d={v().tape.bars} />
            <Show when={props.fms}>
              {(fms) => (
                <Show when={fmsLinePath(props.g, v().ft, fms().ft)}>
                  {(d) => <path class={s.fms} d={d()} />}
                </Show>
              )}
            </Show>
            <Show when={props.sel}>
              {(sel) => (
                <path
                  class={s.bug}
                  clip-path={`url(#${bugClip})`}
                  d={selBugPath(props.g, v().ft, sel().ft)}
                />
              )}
            </Show>
          </>
        )}
      </Show>
      <Show when={props.read.kind !== 'flag'}>
        <path class={s.readout} d={altitudeBoxPath(props.g)} />
      </Show>
    </>
  );
}

/** The labels, the readout's digits, GND or the ALT flag, the selected altitude and the BARO. */
export function AltitudeText(props: AltitudeProps & { baro: string }) {
  const at = () => altitudeReadout(props.g);
  return (
    <>
      <Show when={props.view}>
        {(v) => (
          <>
            <Index each={v().tape.labels}>
              {(l) => (
                <div class={s.altitudeLabel} style={{ left: `${l().x}px`, top: `${l().y}px` }}>
                  <span class={s.thousandsLabel}>{l().hi}</span>
                  <span class={s.hundredsLabel}>{l().lo}</span>
                </div>
              )}
            </Index>
            <Wheel
              cell={at().tenThousands}
              wheel={v().digits.tenThousands}
              row={slotText}
              class={s.thousands}
            />
            <Show when={v().digits.tenThousands.rows[1]?.kind === 'neg'}>
              <div class={s.neg} style={{ left: `${at().neg.x}px`, top: `${at().neg.y}px` }}>
                <div>N</div>
                <div>E</div>
                <div>G</div>
              </div>
            </Show>
            <Wheel cell={at().thousands} wheel={v().digits.thousands} class={s.thousands} />
            <Wheel cell={at().hundreds} wheel={v().digits.hundreds} class={s.hundreds} />
            <Wheel cell={at().drum} wheel={v().digits.drum} class={s.hundreds} />
          </>
        )}
      </Show>
      <Show when={props.sel}>
        {(sel) => (
          <div class={s.sel} style={{ left: `${at().tapeX}px`, top: `${props.g.selY}px` }}>
            <span class={s.thousands}>{selDigits(sel().ft).hi}</span>
            <span class={s.hundreds}>{selDigits(sel().ft).lo}</span>
          </div>
        )}
      </Show>
      <Show when={props.baro}>
        {(baro) => (
          <div class={s.baro} style={{ left: `${at().tapeX}px`, top: `${props.g.footY}px` }}>
            {baro()}
            <span class={s.unit}> IN</span>
          </div>
        )}
      </Show>
      <Show when={props.read.kind === 'ground'}>
        <div class={s.gnd} style={{ left: `${at().midX}px`, top: `${props.g.yc}px` }}>
          GND
        </div>
      </Show>
      <Show when={props.read.kind === 'flag'}>
        <Flag text="ALT" x={at().tapeX} y={props.g.yc} />
      </Show>
    </>
  );
}
