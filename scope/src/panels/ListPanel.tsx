import { createMemo, For } from 'solid-js';

import { targetMenu } from '../canvas/menus';
import { cx } from '../design/cx';
import { formatAltitude } from '../lib/altitude';
import { climbArrow, climbState, formatDistance, formatGsWake, padTrack } from '../lib/format';
import { isEmergency, isStale, trackLabel, typeLabel } from '../render/scene/rules';
import { distanceFromSite, type SortKey, sortTracks, toggleSort } from '../state/listSort';
import {
  isFiltered,
  listSort,
  magneticTrack,
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

/**
 * Row tone: emergency over filtered over stale over ground over climb state. The scope's colors,
 * but for a target the filter reduces, which the list dims.
 */
function rowTone(t: Track): string | undefined {
  if (isEmergency(t)) return s.emergency;
  if (isFiltered(t)) return s.filtered;
  if (isStale(t)) return s.stale;
  if (t.alt === 'ground') return s.ground;
  const c = climbState(t.verticalRate);
  return c === 'climbing' ? s.climbing : c === 'descending' ? s.descending : undefined;
}

export function ListPanel() {
  const rows = createMemo(() => {
    snapshotVersion();
    return sortTracks([...trackStore.tracks.values()], listSort());
  });
  return (
    <Window id="list" class={s.panel} bodyClass={s.body}>
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
              <span>{typeLabel(t)}</span>
              <span>
                {formatAltitude(t.alt, settings.altimeter)}
                {climbArrow(t.verticalRate)}
              </span>
              <span>{formatGsWake(t.gs, t.category)}</span>
              <span>{padTrack(magneticTrack(t))}</span>
              <span>{t.squawk ?? '----'}</span>
              <span>{formatDistance(distanceFromSite(t))}</span>
              <span>{t.source.toUpperCase()}</span>
            </div>
          )}
        </For>
      </div>
    </Window>
  );
}
