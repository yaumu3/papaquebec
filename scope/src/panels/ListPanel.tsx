import { createMemo, For } from 'solid-js';

import { targetMenu } from '../canvas/menus';
import { cx } from '../design/cx';
import { formatAltitude } from '../lib/altitude';
import { climbArrow, climbState, formatGsWake, padTrack } from '../lib/format';
import { isEmergency, isStale, trackLabel } from '../render/scene/rules';
import { classify } from '../state/filter';
import { distanceFromSite, type SortKey, sortTracks, toggleSort } from '../state/listSort';
import {
  listSort,
  selected,
  setListSort,
  setMenu,
  setSelected,
  snapshotVersion,
} from '../state/scope';
import { settings } from '../state/settings';
import type { Track } from '../state/track';
import { trackStore } from '../state/tracks';
import { Window } from '../ui/Window';

import s from './ListPanel.module.css';

const COLUMNS: [SortKey, string][] = [
  ['id', 'CS/REG'],
  ['type', 'TYPE'],
  ['alt', 'ALT'],
  ['gs', 'GSW'],
  ['track', 'TRK'],
  ['squawk', 'SQ'],
  ['dist', 'DIST'],
  ['source', 'SRC'],
];

/** Row tone: emergency over stale over ground over climb state, matching the scope's colors. */
function rowTone(t: Track): string | undefined {
  if (isEmergency(t)) return s.emergency;
  if (isStale(t)) return s.stale;
  if (t.alt === 'ground') return s.ground;
  const c = climbState(t.baroRate);
  return c === 'climbing' ? s.climbing : c === 'descending' ? s.descending : undefined;
}

function formatDistance(t: Track): string {
  const d = distanceFromSite(t);
  return d === undefined ? '---' : d < 100 ? d.toFixed(1) : String(Math.round(d));
}

export function ListPanel() {
  const rows = createMemo(() => {
    snapshotVersion();
    const { ground, lowerFl, upperFl, squawk } = settings.filter;
    const { transitionAltFt, qnhInHg } = settings.altimeter;
    const shown = [...trackStore.tracks.values()].filter(
      (t) =>
        classify(t, { ground, lowerFl, upperFl, squawk }, { transitionAltFt, qnhInHg }) === 'shown',
    );
    return sortTracks(shown, listSort());
  });
  return (
    <Window id="list" title={<>Aircraft ({rows().length})</>} class={s.panel} bodyClass={s.body}>
      <div class={s.header}>
        <For each={COLUMNS}>
          {([key, label]) => (
            <button
              type="button"
              class={cx(s.sort, listSort().key === key && s.sortActive)}
              onClick={() => setListSort((sort) => toggleSort(sort, key))}
            >
              {label}
              {listSort().key === key ? (listSort().dir === 'asc' ? '▴' : '▾') : ''}
            </button>
          )}
        </For>
      </div>
      <div class={s.rows}>
        <For each={rows()}>
          {(t) => (
            <div
              class={cx(s.row, rowTone(t), selected() === t.hex && s.selected)}
              onClick={() => setSelected(t.hex)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, items: targetMenu(t) });
              }}
            >
              <span class={cx(!t.flight && !t.registration && s.hex)}>{trackLabel(t)}</span>
              <span class={s.dim}>{t.type ?? `[${t.category ?? '--'}]`}</span>
              <span>
                {formatAltitude(t.alt, settings.altimeter)}
                {climbArrow(t.baroRate)}
              </span>
              <span>{formatGsWake(t.gs, t.category)}</span>
              <span>{padTrack(t.track)}</span>
              <span>{t.squawk ?? '----'}</span>
              <span>{formatDistance(t)}</span>
              <span class={s.dim}>{t.source.toUpperCase()}</span>
            </div>
          )}
        </For>
      </div>
    </Window>
  );
}
