import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  on,
  onCleanup,
  Show,
} from 'solid-js';

import { cx } from '../design/cx';
import { advisoryWord } from '../lib/acas';
import { type EmergencyCode, type Priority, statusTags, wakeLetter } from '../lib/format';
import { isStale, trackLabel } from '../render/scene/rules';
import { detailTab, keepViewOf, plotted, setDetailTab } from '../state/history';
import type { ReadingKey } from '../state/plotted';
import { selected, setPan, snapshotVersion } from '../state/scope';
import { DETAIL_TABS, type DetailTab } from '../state/settings';
import type { Track } from '../state/track';
import { trackStore } from '../state/tracks';
import { tabFor } from '../ui/tabKeys';
import { Window } from '../ui/Window';
import { advisoryBelow } from './header';
import { History } from './history/History';
import { NONE, positionReading, type Reading, READINGS } from './readings';
import { Value } from './Value';

import s from './DetailPanel.module.css';

/** One labeled reading in the detail grid; a button for a cell that does something. */
function Cell(props: {
  k: string;
  r: Reading;
  /** A faint glyph after the label, for a cell that does something. */
  glyph?: string;
  dim?: boolean | undefined;
  /** Columns taken, for a value too long for one. */
  span?: 2 | 4 | undefined;
  onClick?: () => void;
}) {
  const cls = () =>
    cx(
      s.cell,
      props.span === 2 && s.span2,
      props.span === 4 && s.span4,
      (props.dim ?? props.r === NONE) && s.dim,
    );
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
function ReadingCell(props: { of: ReadingKey; t: Track; dim?: boolean; span?: 4 }) {
  const spec = READINGS[props.of];
  return <Cell k={spec.label} r={spec.format(props.t)} dim={props.dim} span={props.span} />;
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

/** The word the header tags each priority with. */
const PRIORITY_WORDS: Record<Priority, string> = { lifeguard: 'LIFEGUARD', minfuel: 'MIN FUEL' };

/** The squawk, or the emergency code it is with its shorthand. */
function Squawk(props: { squawk: string | undefined; code: EmergencyCode | null }) {
  return (
    <Show when={props.squawk}>
      {(squawk) => (
        <Show when={props.code} fallback={<span class={cx(s.text, s.squawk)}>{squawk()}</span>}>
          {(code) => <span class={cx(s.text, s.code)}>{`${squawk()} ${code()}`}</span>}
        </Show>
      )}
    </Show>
  );
}

/**
 * Who it is: the flight on the first line, the airframe on the second. An active advisory stands
 * at the right end of the first, or of the second when the first has no room for it.
 */
function Header(props: { t: Track }) {
  const tags = createMemo(() => statusTags(props.t.squawk, props.t.emergency));
  const ra = () => (props.t.ra?.terminated ? undefined : props.t.ra);
  const [raBelow, setRaBelow] = createSignal(false);
  let head!: HTMLDivElement;
  let flight!: HTMLDivElement;
  let advisory: HTMLSpanElement | undefined;
  const fit = () =>
    setRaBelow(
      advisoryBelow({
        flight: flight.offsetWidth,
        gap: Number.parseFloat(getComputedStyle(head).columnGap) || 0,
        advisory: advisory?.offsetWidth ?? 0,
        room: head.clientWidth,
      }),
    );
  const resized = new ResizeObserver(fit);
  onCleanup(() => resized.disconnect());
  const type = () => props.t.type && `${props.t.type}/${wakeLetter(props.t.category)}`;
  const about = () => [props.t.description, props.t.category].filter(Boolean).join(' · ');
  return (
    <div
      ref={(el) => {
        head = el;
        resized.observe(el);
      }}
      class={cx(s.head, raBelow() && s.raBelow)}
    >
      <div
        ref={(el) => {
          flight = el;
          resized.observe(el);
        }}
        class={s.flight}
      >
        <span class={cx(s.text, s.callsign)}>{trackLabel(props.t)}</span>
        <Squawk squawk={props.t.squawk} code={tags().code} />
        <Show when={props.t.ident}>
          <span class={s.tag}>ID</span>
        </Show>
        <Show when={tags().status}>{(status) => <span class={s.emergency}>{status()}</span>}</Show>
        <Show when={tags().priority}>
          {(priority) => <span class={s.priority}>{PRIORITY_WORDS[priority()]}</span>}
        </Show>
      </div>
      <Show when={ra()}>
        {(r) => (
          <span
            ref={(el) => {
              advisory = el;
              resized.observe(el);
              onCleanup(() => {
                resized.unobserve(el);
                advisory = undefined;
              });
            }}
            class={cx(s.emergency, s.ra)}
          >
            RA {advisoryWord(r())}
          </span>
        )}
      </Show>
      <div class={cx(s.text, s.airframe)}>
        <Show when={type()}>
          <span title={about() || undefined}>{type()}</span>
        </Show>
        <Show when={props.t.registration}>
          <span>{props.t.registration}</span>
        </Show>
        <span>{props.t.hex.toUpperCase()}</span>
      </div>
    </div>
  );
}

const PANEL_ID = 'detail-tabpanel';
const tabId = (tab: DetailTab): string => `detail-tab-${tab}`;
const TAB_LABELS: Record<DetailTab, string> = { now: 'NOW', history: 'HISTORY' };

/** The tabs of the detail panel, on a rule that runs the panel's width; the open one is a box open at its foot. */
function Tabs() {
  const buttons: Partial<Record<DetailTab, HTMLButtonElement>> = {};
  return (
    <div
      role="tablist"
      class={s.tabs}
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const next = tabFor(e.key, DETAIL_TABS, detailTab());
        if (next === null) return;
        e.preventDefault();
        setDetailTab(next);
        buttons[next]?.focus();
      }}
    >
      <For each={DETAIL_TABS}>
        {(tab) => (
          <button
            ref={(el) => {
              buttons[tab] = el;
            }}
            type="button"
            role="tab"
            id={tabId(tab)}
            class={cx(s.tab, detailTab() === tab && s.on)}
            aria-selected={detailTab() === tab}
            aria-controls={PANEL_ID}
            tabIndex={detailTab() === tab ? 0 : -1}
            onClick={() => setDetailTab(tab)}
          >
            {TAB_LABELS[tab]}
            <Show when={tab === 'history'}>
              <span class={s.count}>{plotted().length}</span>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}

/** The readings table. */
function Readings(props: { t: Track }) {
  return (
    <div class={s.readings}>
      <Group name="FLT">
        <ReadingCell of="alt" t={props.t} />
        <ReadingCell of="vs" t={props.t} />
        <ReadingCell of="gs" t={props.t} />
        <ReadingCell of="trk" t={props.t} />
      </Group>
      <Group name="NAV">
        <ReadingCell of="selAlt" t={props.t} />
        <ReadingCell of="fmsAlt" t={props.t} />
        <ReadingCell of="selHdg" t={props.t} />
        <ReadingCell of="qnh" t={props.t} />
        <ReadingCell of="modes" t={props.t} span={4} />
      </Group>
      <Group name="AIR">
        <ReadingCell of="ias" t={props.t} />
        <ReadingCell of="tas" t={props.t} />
        <ReadingCell of="mach" t={props.t} />
        <ReadingCell of="wind" t={props.t} />
        <ReadingCell of="oat" t={props.t} />
        <ReadingCell of="tat" t={props.t} />
      </Group>
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

export function DetailPanel() {
  const track = createMemo(() => {
    snapshotVersion();
    const hex = selected();
    return hex ? (trackStore.tracks.get(hex) ?? null) : null;
  });
  createEffect(on(createMemo(selected), keepViewOf));
  return (
    <Window id="detail" bodyClass={s.body}>
      <Show
        when={track()}
        fallback={<div class={s.empty}>{selected() ? 'NOT IN FEED' : 'NO TARGET SELECTED'}</div>}
      >
        {(t) => (
          <>
            <Header t={t()} />
            <Tabs />
            <div role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(detailTab())}>
              <Show when={detailTab() === 'history'} fallback={<Readings t={t()} />}>
                <History track={t()} />
              </Show>
            </div>
          </>
        )}
      </Show>
    </Window>
  );
}
