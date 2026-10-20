import { type JSX, Show } from 'solid-js';

import { cx } from '../../../design/cx';
import { isStale } from '../../../render/scene/rules';
import type { ReadingKey } from '../../../state/plotted';
import { setPan } from '../../../state/scope';
import type { Track } from '../../../state/track';
import { NONE, positionReading, type Reading, READINGS } from '../../readings';
import { Value } from '../../Value';

import s from './Surv.module.css';

/** One labeled reading in the detail grid; a button for a cell that does something. */
function Cell(props: {
  k: string;
  r: Reading;
  /** A faint glyph after the label, for a cell that does something. */
  glyph?: string;
  dim?: boolean | undefined;
  /** Columns taken, for a value too long for one. */
  span?: 2 | undefined;
  onClick?: () => void;
}) {
  const cls = () =>
    cx(s.cell, props.span === 2 && s.span2, (props.dim ?? props.r === NONE) && s.dim);
  const body = () => (
    <>
      <div class={s.k}>
        {props.k}
        <Show when={props.glyph}>
          <span class={s.glyph}>{props.glyph}</span>
        </Show>
      </div>
      <Value r={props.r} />
    </>
  );
  return (
    <Show when={props.onClick} fallback={<div class={cls()}>{body()}</div>}>
      <button type="button" class={cx(cls(), s.action)} onClick={() => props.onClick?.()}>
        {body()}
      </button>
    </Show>
  );
}

/** The cell of one reading of the catalog. */
function ReadingCell(props: { of: ReadingKey; t: Track; dim?: boolean }) {
  const spec = READINGS[props.of];
  return <Cell k={spec.label} r={spec.format(props.t)} dim={props.dim} />;
}

/** The position, whose tap centres the scope on it. */
function PositionCell(props: { t: Track }) {
  const reading = () => positionReading(props.t.position);
  return (
    <Cell
      k={reading().k}
      r={reading().r}
      glyph="⌖"
      dim={props.t.position.kind !== 'live'}
      span={2}
      onClick={() => {
        const at = props.t.position;
        if (at.kind !== 'none') setPan({ x: at.x, y: at.y });
      }}
    />
  );
}

/** Readings that belong together, under the name that stands to their left. */
function Group(props: { name: string; children: JSX.Element }) {
  return (
    <div class={s.group}>
      <div class={s.name}>{props.name}</div>
      <div class={s.grid}>{props.children}</div>
    </div>
  );
}

/** The surveillance readings: where the position comes from and how well it is heard. */
export function Surv(props: { t: Track }) {
  return (
    <div class={s.surv}>
      <Group name="POS">
        <PositionCell t={props.t} />
        <ReadingCell of="nic" t={props.t} />
        <ReadingCell of="nacp" t={props.t} />
      </Group>
      <Group name="RX">
        <ReadingCell of="src" t={props.t} />
        <ReadingCell of="rssi" t={props.t} />
        <ReadingCell of="msgs" t={props.t} />
        <ReadingCell of="age" t={props.t} dim={isStale(props.t)} />
      </Group>
    </div>
  );
}
