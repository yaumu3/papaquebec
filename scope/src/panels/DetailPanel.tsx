import { createMemo, Show } from 'solid-js';

import { cx } from '../design/cx';
import { type DisplayAltitude, displayAltitude, uncorrected } from '../lib/altitude';
import {
  climbArrow,
  emergencyCode,
  formatMach,
  formatModes,
  formatWind,
  padBearing,
  wakeLetter,
} from '../lib/format';
import { hpaToInHg } from '../lib/metar';
import { isStale, trackLabel } from '../render/scene/rules';
import { selected, snapshotVersion } from '../state/scope';
import { settings } from '../state/settings';
import type { Position } from '../state/track';
import { trackStore } from '../state/tracks';
import { Divider, SectionTitle } from '../ui/Section';
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
}

const NONE: Reading = { v: '---' };

/** Latitude and longitude as two readings; a fix that is not live carries its caveat on LON. */
function positionReadings(p: Position): [Reading, Reading] {
  if (p.kind === 'none') return [NONE, NONE];
  const lat = { v: p.lat.toFixed(5) };
  const lon = p.lon.toFixed(5);
  switch (p.kind) {
    case 'last':
      return [lat, { v: lon, unit: 'LAST KNOWN' }];
    case 'rr':
      return [lat, { v: lon, unit: 'ROUGH' }];
    default:
      return [lat, { v: lon }];
  }
}

function altitudeReading(
  alt: number | 'ground' | undefined,
  baroRate: number | undefined,
): Reading {
  return levelReading(displayAltitude(alt, settings.altimeter), climbArrow(baroRate).trim());
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
        </Show>
      </div>
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
    <Window id="detail" title="Target Detail">
      <Show
        when={track()}
        fallback={<div class={s.empty}>{selected() ? 'NOT IN FEED' : 'NO TARGET SELECTED'}</div>}
      >
        {(t) => {
          const ecode = () => emergencyCode(t().squawk, t().emergency);
          return (
            <>
              <div class={s.callsign}>
                {trackLabel(t())}
                <Show when={ecode()}>
                  <span class={s.badge}>{ecode()}</span>
                </Show>
              </div>
              <Show when={t().description}>
                <div class={s.description}>{t().description}</div>
              </Show>
              <div class={cx(s.grid, s.identity)}>
                <Cell k="HEX" r={{ v: t().hex.toUpperCase() }} />
                <Cell k="SQUAWK" r={plain(t().squawk)} tone={ecode() ? 'alert' : undefined} />
                <Cell
                  k="TYPE"
                  r={typeReading(t().type, t().category)}
                  tone={t().type === undefined ? undefined : 'enriched'}
                  dim={t().type === undefined}
                />
                <Cell k="REG" r={plain(t().registration)} tone="enriched" />
              </div>
              <Divider />
              <SectionTitle>FLIGHT</SectionTitle>
              <div class={s.grid}>
                <Cell k="ALT" r={altitudeReading(t().alt, t().baroRate)} />
                <Cell k="VS" r={signed(t().baroRate, 'fpm')} />
                <Cell k="GS" r={num(t().gs, 'kt')} />
                <Cell k="TRK" r={bearing(t().track)} />
                <Cell
                  k="LAT"
                  r={positionReadings(t().position)[0]}
                  dim={t().position.kind !== 'live'}
                />
                <Cell
                  k="LON"
                  r={positionReadings(t().position)[1]}
                  dim={t().position.kind !== 'live'}
                />
              </div>
              <Divider />
              <SectionTitle>AIR DATA</SectionTitle>
              <div class={s.grid}>
                <Cell k="TAS" r={num(t().tas, 'kt')} />
                <Cell k="IAS" r={num(t().ias, 'kt')} />
                <Cell
                  k="MACH"
                  r={plain(t().mach === undefined ? undefined : formatMach(t().mach))}
                />
                <Cell
                  k="WIND"
                  r={
                    t().windDir === undefined || t().windSpeed === undefined
                      ? NONE
                      : { v: formatWind(t().windDir, t().windSpeed), unit: 'kt' }
                  }
                />
                <Cell k="OAT" r={signed(t().oat, '°C')} />
                <Cell k="TAT" r={signed(t().tat, '°C')} />
              </div>
              <Divider />
              <SectionTitle>NAV</SectionTitle>
              <div class={s.grid}>
                <Cell k="SEL ALT" r={selectedReading(t().selAlt)} />
                <Cell k="FMS ALT" r={selectedReading(t().fmsAlt)} />
                <Cell k="SEL HDG" r={bearing(t().selHeading)} />
                <Cell k="QNH" r={num(inHg(t().navQnh), 'inHg', 2)} />
                <Cell k="MODES" r={plain(formatModes(t().navModes))} wide />
              </div>
              <Divider />
              <SectionTitle>SIGNAL</SectionTitle>
              <div class={s.grid}>
                <Cell k="NIC" r={num(t().nic, '')} />
                <Cell k="NACP" r={num(t().nacP, '')} />
                <Cell k="MSGS" r={num(t().messages, '')} />
                <Cell k="RSSI" r={num(t().rssi, 'dB', 1)} />
                <Cell k="SEEN" r={num(t().seen, 's', 1)} />
                <Cell k="POS" r={num(t().seenPos, 's', 1)} dim={isStale(t())} />
                <Cell k="SRC" r={{ v: t().source.toUpperCase() }} />
              </div>
            </>
          );
        }}
      </Show>
    </Window>
  );
}
