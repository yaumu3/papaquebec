import { createMemo, type JSX, Show } from 'solid-js';

import { cx } from '../design/cx';
import { advisoryWord } from '../lib/acas';
import { emergencyCode, wakeLetter } from '../lib/format';
import { isStale, trackLabel } from '../render/scene/rules';
import { plotted, togglePlot } from '../state/history';
import type { ReadingKey } from '../state/plotted';
import { selected, setPan, snapshotVersion } from '../state/scope';
import type { Track } from '../state/track';
import { trackStore } from '../state/tracks';
import { copyText } from '../ui/clipboard';
import { Divider } from '../ui/Section';
import { Window } from '../ui/Window';
import { History } from './history/History';
import { NONE, plain, positionReading, type Reading, READINGS } from './readings';
import { Value } from './Value';

import s from './DetailPanel.module.css';

/** Type with its wake letter in the flight-plan form, e.g. B738/M, then the raw category. */
function typeReading(type: string | undefined, category: string | undefined): Reading {
  const v = `${type ?? '----'}/${wakeLetter(category)}`;
  return category === undefined ? { v } : { v, also: category };
}

/** One labeled reading in the detail grid; every cell is a button. */
function Cell(props: {
  k: string;
  r: Reading;
  /** A faint glyph after the label, for a cell that does something other than plot. */
  glyph?: string;
  /** Pressed, for a cell that plots: filled light, label and value dark. */
  on?: boolean | undefined;
  dim?: boolean | undefined;
  tone?: 'alert' | undefined;
  /** Columns taken, for a value too long for one. */
  span?: 2 | 4 | undefined;
  /** What hovering the cell tells beyond its value. */
  title?: string | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={props.title}
      class={cx(
        s.cell,
        props.span === 2 && s.span2,
        props.span === 4 && s.span4,
        props.tone === 'alert' && s.alert,
        (props.dim ?? props.r === NONE) && s.dim,
        props.on && s.on,
      )}
      aria-pressed={props.on}
      onClick={() => props.onClick()}
    >
      <div class={s.k}>
        {props.k}
        <Show when={props.glyph}>
          <span class={s.glyph}>{props.glyph}</span>
        </Show>
      </div>
      <Value r={props.r} />
    </button>
  );
}

/** The cell of one reading of the catalog: a tap plots it, another takes it off again. */
function ReadingCell(props: { of: ReadingKey; t: Track; dim?: boolean; span?: 4 }) {
  const spec = READINGS[props.of];
  return (
    <Cell
      k={spec.label}
      r={spec.format(props.t)}
      on={plotted().includes(props.of)}
      dim={props.dim}
      span={props.span}
      onClick={() => togglePlot(props.of)}
    />
  );
}

/** A cell of the identity, whose tap copies the value. */
function CopyCell(props: {
  k: string;
  r: Reading;
  text: string | undefined;
  dim?: boolean;
  tone?: 'alert' | undefined;
  title?: string | undefined;
}) {
  return (
    <Cell
      k={props.k}
      r={props.r}
      glyph="⧉"
      dim={props.dim}
      tone={props.tone}
      title={props.title}
      onClick={() => {
        if (props.text !== undefined) copyText(props.text);
      }}
    />
  );
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

export function DetailPanel() {
  const track = createMemo(() => {
    snapshotVersion();
    const hex = selected();
    return hex ? (trackStore.tracks.get(hex) ?? null) : null;
  });
  return (
    <Window id="detail">
      <Show
        when={track()}
        fallback={<div class={s.empty}>{selected() ? 'NOT IN FEED' : 'NO TARGET SELECTED'}</div>}
      >
        {(t) => {
          const ecode = () => emergencyCode(t().squawk, t().emergency);
          return (
            <>
              <div class={s.head}>
                <div class={s.callsign}>
                  {trackLabel(t())}
                  <Show when={ecode()}>
                    <span class={s.badge}>{ecode()}</span>
                  </Show>
                  <Show when={t().ra}>
                    {(ra) => <span class={s.badge}>RA {advisoryWord(ra())}</span>}
                  </Show>
                  <Show when={t().ident}>
                    <span class={s.tag}>ID</span>
                  </Show>
                </div>
              </div>
              <Divider />
              <History track={t()} />
              <Group name="ID">
                <CopyCell k="HEX" r={{ v: t().hex.toUpperCase() }} text={t().hex.toUpperCase()} />
                <CopyCell
                  k="SQUAWK"
                  r={plain(t().squawk)}
                  text={t().squawk}
                  tone={ecode() ? 'alert' : undefined}
                />
                <CopyCell
                  k="TYPE"
                  r={typeReading(t().type, t().category)}
                  text={t().type}
                  title={t().description}

                  dim={t().type === undefined}
                />
                <CopyCell k="REG" r={plain(t().registration)} text={t().registration} />
              </Group>
              <Group name="FLT">
                <ReadingCell of="alt" t={t()} />
                <ReadingCell of="vs" t={t()} />
                <ReadingCell of="gs" t={t()} />
                <ReadingCell of="trk" t={t()} />
              </Group>
              <Group name="NAV">
                <ReadingCell of="selAlt" t={t()} />
                <ReadingCell of="fmsAlt" t={t()} />
                <ReadingCell of="selHdg" t={t()} />
                <ReadingCell of="qnh" t={t()} />
                <ReadingCell of="modes" t={t()} span={4} />
              </Group>
              <Group name="AIR">
                <ReadingCell of="ias" t={t()} />
                <ReadingCell of="tas" t={t()} />
                <ReadingCell of="mach" t={t()} />
                <ReadingCell of="wind" t={t()} />
                <ReadingCell of="oat" t={t()} />
                <ReadingCell of="tat" t={t()} />
              </Group>
              <Group name="POS">
                <PositionCell t={t()} />
                <ReadingCell of="nic" t={t()} />
                <ReadingCell of="nacp" t={t()} />
              </Group>
              <Group name="RX">
                <ReadingCell of="src" t={t()} />
                <ReadingCell of="rssi" t={t()} />
                <ReadingCell of="msgs" t={t()} />
                <ReadingCell of="age" t={t()} dim={isStale(t())} />
              </Group>
            </>
          );
        }}
      </Show>
    </Window>
  );
}
