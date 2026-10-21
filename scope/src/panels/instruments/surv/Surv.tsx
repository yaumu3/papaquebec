import { createMemo, Index, type JSX, Show } from 'solid-js';

import { cx } from '../../../design/cx';
import { setPan } from '../../../state/scope';
import type { Track } from '../../../state/track';
import type { Reading } from '../../readings';
import { Value } from '../../Value';
import type { Moment } from '../moment';
import { type SurvCell, survCells } from './cells';

import s from './Surv.module.css';

/** One labeled reading; a button for a cell that does something. */
function Cell(props: {
  k: string;
  r: Reading;
  /** A faint glyph after the label, for a cell that does something. */
  glyph?: string;
  dim: boolean;
  /** Columns taken, for a value too long for one. */
  span?: 2 | undefined;
  onClick?: () => void;
}) {
  const cls = () => cx(s.cell, props.span === 2 && s.span2, props.dim && s.dim);
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

/** Readings that belong together, under the name that stands to their left. */
function Group(props: { name: string; children: JSX.Element }) {
  return (
    <div class={s.group}>
      <div class={s.name}>{props.name}</div>
      <div class={s.grid}>{props.children}</div>
    </div>
  );
}

/** The cell, a button when it is the position: its tap centres the scope on the target. */
function SurvCellView(props: { cell: SurvCell; t: Track }) {
  const centre = () => {
    const p = props.t.position;
    if (p.kind !== 'none') setPan({ x: p.x, y: p.y });
  };
  return (
    <Show
      when={props.cell.key === 'pos'}
      fallback={<Cell k={props.cell.k} r={props.cell.r} dim={props.cell.dim} />}
    >
      <Cell
        k={props.cell.k}
        r={props.cell.r}
        dim={props.cell.dim}
        glyph="⌖"
        span={2}
        onClick={centre}
      />
    </Show>
  );
}

/** The surveillance readings: where the position comes from and how well it is heard. */
export function Surv(props: { t: Track; moment: Moment }) {
  const cells = createMemo(() => survCells(props.moment));
  return (
    <div class={s.surv}>
      <Group name="POS">
        <Index each={cells().slice(0, 3)}>{(c) => <SurvCellView cell={c()} t={props.t} />}</Index>
      </Group>
      <Group name="RX">
        <Index each={cells().slice(3)}>{(c) => <SurvCellView cell={c()} t={props.t} />}</Index>
      </Group>
    </div>
  );
}
