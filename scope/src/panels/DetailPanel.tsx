import { createMemo, Show } from 'solid-js';

import { cx } from '../design/cx';
import { displayAltitude } from '../lib/altitude';
import {
  climbArrow,
  emergencyCode,
  formatMach,
  formatTemp,
  formatWind,
  padTrack,
  wakeLetter,
} from '../lib/format';
import { isStale, trackLabel } from '../render/scene/rules';
import { selected, snapshotVersion } from '../state/scope';
import { settings } from '../state/settings';
import type { Position } from '../state/track';
import { trackStore } from '../state/tracks';
import { SectionTitle } from '../ui/Section';
import { Window } from '../ui/Window';

import s from './DetailPanel.module.css';

function positionText(p: Position): string {
  switch (p.kind) {
    case 'live':
      return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
    case 'last':
      return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · LAST KNOWN`;
    case 'rr':
      return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · ROUGH (rr)`;
    default:
      return 'NO POSITION';
  }
}

function altitudeText(alt: number | 'ground' | undefined): string {
  const d = displayAltitude(alt, settings.altimeter);
  switch (d.kind) {
    case 'altitude':
      return `${d.feet} ft`;
    case 'level':
      return `FL${String(Math.round(d.feet / 100)).padStart(3, '0')}`;
    case 'ground':
      return 'GND';
    default:
      return '---';
  }
}

const num = (v: number | undefined, digits = 0, unit = '') =>
  v === undefined ? '---' : `${v.toFixed(digits)}${unit}`;

const signed = (v: number | undefined, unit: string) =>
  v === undefined ? '---' : `${v > 0 ? '+' : ''}${Math.round(v)}${unit}`;

/** One labeled value in the detail grid. */
function Cell(props: { k: string; v: string; dim?: boolean }) {
  return (
    <div class={cx((props.dim ?? props.v === '---') && s.dim)}>
      <div class={s.k}>{props.k}</div>
      <div class={s.v}>{props.v}</div>
    </div>
  );
}

export function DetailPanel() {
  const track = createMemo(() => {
    snapshotVersion();
    const hex = selected();
    return hex ? (trackStore.tracks.get(hex) ?? null) : null;
  });
  const title = () => {
    const t = track();
    return t ? trackLabel(t) : (selected()?.toUpperCase() ?? 'Target Detail');
  };
  return (
    <Window id="detail" title={title()} class={s.panel}>
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
              <div class={s.meta}>
                {t().hex.toUpperCase()} · {t().category ?? '--'} · {t().source.toUpperCase()}
                <Show when={t().type}>
                  {' · '}
                  <span class={s.enriched}>{t().type}</span>
                </Show>
                <Show when={t().registration}>
                  {' · '}
                  <span class={s.enriched}>{t().registration}</span>
                </Show>
              </div>
              <Show when={t().description}>
                <div class={cx(s.meta, s.enriched)}>{t().description}</div>
              </Show>
              <SectionTitle>FLIGHT</SectionTitle>
              <div class={cx(s.grid, s.cols4)}>
                <Cell k="ALT" v={`${altitudeText(t().alt)} ${climbArrow(t().baroRate)}`.trim()} />
                <Cell k="VS" v={signed(t().baroRate, ' fpm')} />
                <Cell k="GSW" v={`${num(t().gs, 0, ' kt')} ${wakeLetter(t().category)}`.trim()} />
                <Cell k="TRK" v={`${padTrack(t().track)}°`} />
              </div>
              <SectionTitle>AIR DATA</SectionTitle>
              <div class={cx(s.grid, s.cols3)}>
                <Cell k="TAS" v={num(t().tas, 0, ' kt')} />
                <Cell k="IAS" v={num(t().ias, 0, ' kt')} />
                <Cell k="MACH" v={formatMach(t().mach)} />
                <Cell k="WIND" v={formatWind(t().windDir, t().windSpeed)} />
                <Cell k="OAT" v={formatTemp(t().oat)} />
                <Cell k="TAT" v={formatTemp(t().tat)} />
              </div>
              <SectionTitle>SIGNAL</SectionTitle>
              <div class={cx(s.grid, s.cols3)}>
                <Cell k="SQUAWK" v={t().squawk ?? '---'} />
                <Cell k="NIC / NACP" v={`${t().nic ?? '-'} / ${t().nacP ?? '-'}`} />
                <Cell k="MSGS" v={num(t().messages)} />
                <Cell k="RSSI" v={num(t().rssi, 1, ' dB')} />
                <Cell k="SEEN" v={num(t().seen, 1, ' s')} />
                <Cell k="POS" v={num(t().seenPos, 1, ' s')} dim={isStale(t())} />
              </div>
              <div class={s.pos}>{positionText(t().position)}</div>
            </>
          );
        }}
      </Show>
    </Window>
  );
}
