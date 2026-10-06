import { createMemo, type JSX, Show } from 'solid-js';

import { cx } from '../design/cx';
import { emergencyCode, wakeLetter } from '../lib/format';
import { isStale, trackLabel } from '../render/scene/rules';
import type { ReadingKey } from '../state/plotted';
import { selected, snapshotVersion } from '../state/scope';
import type { Position, Track } from '../state/track';
import { trackStore } from '../state/tracks';
import { Divider } from '../ui/Section';
import { Window } from '../ui/Window';
import { History } from './history/History';
import { NONE, plain, type Reading, READINGS } from './readings';
import { Value } from './Value';

import s from './DetailPanel.module.css';

/** Type with its wake letter in the flight-plan form, e.g. B738/M, then the raw category. */
function typeReading(type: string | undefined, category: string | undefined): Reading {
  const v = `${type ?? '----'}/${wakeLetter(category)}`;
  return category === undefined ? { v } : { v, also: category };
}

/** One labeled reading in the detail grid. */
function Cell(props: {
  k: string;
  r: Reading;
  dim?: boolean | undefined;
  tone?: 'enriched' | 'alert' | undefined;
  /** Spans the whole row, for a value too long for one column. */
  wide?: boolean | undefined;
}) {
  return (
    <div
      class={cx(
        s.cell,
        props.wide && s.wide,
        props.tone === 'enriched' && s.enriched,
        props.tone === 'alert' && s.alert,
        (props.dim ?? props.r === NONE) && s.dim,
      )}
    >
      <div class={s.k}>{props.k}</div>
      <Value r={props.r} />
    </div>
  );
}

/** The cell of one reading of the catalog. */
function ReadingCell(props: {
  of: ReadingKey;
  t: Track;
  dim?: boolean;
  tone?: 'enriched' | undefined;
  wide?: boolean;
}) {
  const spec = READINGS[props.of];
  return (
    <Cell
      k={spec.label}
      r={spec.format(props.t)}
      dim={props.dim}
      tone={props.tone}
      wide={props.wide}
    />
  );
}

/** One coordinate of the position, which owns up to a fix that is no longer live. */
function Coordinate(props: { position: Position; axis: 'lat' | 'lon' }) {
  const name = () => props.axis.toUpperCase();
  return (
    <Cell
      k={props.position.kind === 'last' ? `LAST ${name()}` : name()}
      r={props.position.kind === 'none' ? NONE : { v: props.position[props.axis].toFixed(5) }}
      dim={props.position.kind !== 'live'}
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
                </div>
                <Show when={t().description}>
                  <div class={s.description}>{t().description}</div>
                </Show>
              </div>
              <Divider />
              <History track={t()} />
              <Divider />
              <Group name="ID">
                <Cell k="HEX" r={{ v: t().hex.toUpperCase() }} />
                <Cell k="SQUAWK" r={plain(t().squawk)} tone={ecode() ? 'alert' : undefined} />
                <Cell
                  k="TYPE"
                  r={typeReading(t().type, t().category)}
                  tone="enriched"
                  dim={t().type === undefined}
                />
                <Cell k="REG" r={plain(t().registration)} tone="enriched" />
              </Group>
              <Divider />
              <Group name="FLT">
                <ReadingCell of="alt" t={t()} />
                <ReadingCell of="vs" t={t()} />
                <ReadingCell of="gs" t={t()} />
                <ReadingCell of="trk" t={t()} tone="enriched" />
              </Group>
              <Divider />
              <Group name="NAV">
                <ReadingCell of="selAlt" t={t()} />
                <ReadingCell of="fmsAlt" t={t()} />
                <ReadingCell of="selHdg" t={t()} />
                <ReadingCell of="qnh" t={t()} />
                <ReadingCell of="modes" t={t()} wide />
              </Group>
              <Divider />
              <Group name="AIR">
                <ReadingCell of="ias" t={t()} />
                <ReadingCell of="tas" t={t()} />
                <ReadingCell of="mach" t={t()} />
                <ReadingCell of="wind" t={t()} />
                <ReadingCell of="oat" t={t()} />
                <ReadingCell of="tat" t={t()} />
              </Group>
              <Divider />
              <Group name="POS">
                <Coordinate position={t().position} axis="lat" />
                <Coordinate position={t().position} axis="lon" />
                <ReadingCell of="nic" t={t()} />
                <ReadingCell of="nacp" t={t()} />
              </Group>
              <Divider />
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
