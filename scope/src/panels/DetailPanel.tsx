import { createMemo, type JSX, Show } from 'solid-js';

import { cx } from '../design/cx';
import { type DisplayAltitude, displayAltitude, uncorrected } from '../lib/altitude';
import {
  climbArrow,
  emergencyCode,
  formatAge,
  formatMach,
  formatModes,
  padBearing,
  wakeLetter,
} from '../lib/format';
import { hpaToInHg } from '../lib/metar';
import { isStale, trackLabel } from '../render/scene/rules';
import { magneticTrack, selected, snapshotVersion } from '../state/scope';
import { settings } from '../state/settings';
import type { Position, Track } from '../state/track';
import { trackStore } from '../state/tracks';
import { Divider } from '../ui/Section';
import { Window } from '../ui/Window';

import s from './DetailPanel.module.css';

/** A value with its unit kept apart so the unit can be set quieter than the number. */
interface Reading {
  v: string;
  unit?: string;
  /** A lit marker after the unit, such as the climb arrow. */
  tail?: string;
  /** A second value after a dot, in the plain text tone whatever the cell's own. */
  also?: string;
  /** A unit after the second value. */
  alsoUnit?: string;
}

const NONE: Reading = { v: '---' };

/** How long ago the target was last heard, and how long ago with a position. */
const ageReading = (t: Track): Reading => ({
  v: `${formatAge(t.seen)} / ${formatAge(t.seenPos)}`,
  unit: 's',
});

function altitudeReading(
  alt: number | 'ground' | undefined,
  verticalRate: number | undefined,
): Reading {
  return levelReading(displayAltitude(alt, settings.altimeter), climbArrow(verticalRate).trim());
}

const selectedReading = (ft: number | undefined): Reading =>
  levelReading(displayAltitude(ft, uncorrected(settings.altimeter)));

function levelReading(d: DisplayAltitude, tail = ''): Reading {
  switch (d.kind) {
    case 'altitude':
      return { v: String(d.feet), unit: 'ft', tail };
    case 'level':
      return { v: `FL${String(Math.round(d.feet / 100)).padStart(3, '0')}`, tail };
    case 'ground':
      return { v: 'GND' };
    default:
      return NONE;
  }
}

/** Type with its wake letter in the flight-plan form, e.g. B738/M, then the raw category. */
function typeReading(type: string | undefined, category: string | undefined): Reading {
  const v = `${type ?? '----'}/${wakeLetter(category)}`;
  return category === undefined ? { v } : { v, also: category };
}

const num = (v: number | undefined, unit: string, digits = 0): Reading =>
  v === undefined ? NONE : { v: v.toFixed(digits), unit };

const bearing = (deg: number | undefined): Reading =>
  deg === undefined ? NONE : { v: `${padBearing(deg)}°` };

/** Magnetic track the scope derives, then the transmitted true one. */
function trackReading(t: Track): Reading {
  const mag = magneticTrack(t);
  if (t.track === undefined || mag === undefined) return NONE;
  return { v: `${padBearing(mag)}°`, also: `${padBearing(t.track)}°`, alsoUnit: 'T' };
}

/** Where the wind blows from, then how fast; blank unless both are known. */
function windReading(dir: number | undefined, speed: number | undefined): Reading {
  if (dir === undefined || speed === undefined) return NONE;
  return { v: `${padBearing(dir)}°`, also: String(Math.round(speed)), alsoUnit: 'kt' };
}

const inHg = (hpa: number | undefined) => (hpa === undefined ? undefined : hpaToInHg(hpa));

const signed = (v: number | undefined, unit: string): Reading =>
  v === undefined ? NONE : { v: `${v > 0 ? '+' : ''}${Math.round(v)}`, unit };

const plain = (v: string | undefined): Reading => (v === undefined ? NONE : { v });

/** One labeled reading in the detail grid. */
function Cell(props: {
  k: string;
  r: Reading;
  dim?: boolean;
  tone?: 'enriched' | 'alert' | undefined;
  /** Spans the whole row, for a value too long for one column. */
  wide?: boolean;
}) {
  return (
    <div
      class={cx(
        s.cell,
        props.wide && s.wide,
        props.tone === 'enriched' && s.enriched,
        props.tone === 'alert' && s.alert,
        (props.dim ?? props.r.v === '---') && s.dim,
      )}
    >
      <div class={s.k}>{props.k}</div>
      <div class={s.v}>
        {props.r.v}
        <Show when={props.r.unit}>
          <span class={s.unit}>{props.r.unit}</span>
        </Show>
        <Show when={props.r.tail}>
          <span class={s.tail}>{props.r.tail}</span>
        </Show>
        <Show when={props.r.also}>
          <span class={s.sep}>·</span>
          <span class={s.also}>{props.r.also}</span>
          <Show when={props.r.alsoUnit}>
            <span class={s.unit}>{props.r.alsoUnit}</span>
          </Show>
        </Show>
      </div>
    </div>
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
                <Cell k="ALT" r={altitudeReading(t().alt, t().verticalRate)} />
                <Cell k="VS" r={signed(t().verticalRate, 'fpm')} />
                <Cell k="GS" r={num(t().gs, 'kt')} />
                <Cell k="TRK" r={trackReading(t())} tone="enriched" />
              </Group>
              <Divider />
              <Group name="NAV">
                <Cell k="SEL ALT" r={selectedReading(t().selAlt)} />
                <Cell k="FMS ALT" r={selectedReading(t().fmsAlt)} />
                <Cell k="SEL HDG" r={bearing(t().selHeading)} />
                <Cell k="QNH" r={num(inHg(t().navQnh), 'inHg', 2)} />
                <Cell k="MODES" r={plain(formatModes(t().navModes))} wide />
              </Group>
              <Divider />
              <Group name="AIR">
                <Cell k="IAS" r={num(t().ias, 'kt')} />
                <Cell k="TAS" r={num(t().tas, 'kt')} />
                <Cell k="MACH" r={{ v: formatMach(t().mach) }} />
                <Cell k="WIND" r={windReading(t().windDir, t().windSpeed)} />
                <Cell k="OAT" r={signed(t().oat, '°C')} />
                <Cell k="TAT" r={signed(t().tat, '°C')} />
              </Group>
              <Divider />
              <Group name="POS">
                <Coordinate position={t().position} axis="lat" />
                <Coordinate position={t().position} axis="lon" />
                <Cell k="NIC" r={num(t().nic, '')} />
                <Cell k="NACP" r={num(t().nacP, '')} />
              </Group>
              <Divider />
              <Group name="RX">
                <Cell k="SRC" r={{ v: t().source.toUpperCase() }} />
                <Cell k="RSSI" r={num(t().rssi, 'dB', 1)} />
                <Cell k="MSGS" r={num(t().messages, '')} />
                <Cell k="SEEN / POS" r={ageReading(t())} dim={isStale(t())} />
              </Group>
            </>
          );
        }}
      </Show>
    </Window>
  );
}
