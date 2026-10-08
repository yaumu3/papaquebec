import { createMemo, For, Index } from 'solid-js';

import { targetMenu } from '../canvas/menus';
import { cx } from '../design/cx';
import { formatAltitude } from '../lib/altitude';
import {
  climbArrow,
  climbState,
  formatDistance,
  formatGsWake,
  padTrack,
  sourceName,
} from '../lib/format';
import { isEmergency, isStale, trackLabel, typeLabel } from '../render/scene/rules';
import { distanceFromSite, type SortKey, sortTracks, toggleSort } from '../state/listSort';
import { magneticTrack } from '../state/magnetic';
import {
  isFiltered,
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

/** One column of the list: the key it sorts by, its heading, and what a row shows in it. */
interface Column {
  key: SortKey;
  label: string;
  /** The longest text it holds, in characters. */
  width: number;
  /** Figures are set to the right. */
  figure?: true;
  cell: (t: Track) => string;
  /** What hangs beside the cell's text, as a trend arrow does. */
  hang?: (t: Track) => string;
  /** Whether the cell is set small and dim, as a bare hex is. */
  faint?: (t: Track) => boolean;
}

const COLUMNS: Column[] = [
  {
    key: 'id',
    label: 'CALLSIGN',
    width: 8,
    cell: trackLabel,
    faint: (t) => !t.flight && !t.registration,
  },
  { key: 'type', label: 'TYPE', width: 4, cell: typeLabel },
  {
    key: 'alt',
    label: 'ALT',
    width: 3,
    figure: true,
    cell: (t) => formatAltitude(t.alt, settings.altimeter),
    hang: (t) => climbArrow(t.verticalRate),
  },
  { key: 'gs', label: 'GSW', width: 3, figure: true, cell: (t) => formatGsWake(t.gs, t.category) },
  { key: 'track', label: 'TRK', width: 3, figure: true, cell: (t) => padTrack(magneticTrack(t)) },
  { key: 'squawk', label: 'SQ', width: 4, figure: true, cell: (t) => t.squawk ?? '----' },
  {
    key: 'dist',
    label: 'DIST',
    width: 4,
    figure: true,
    cell: (t) => formatDistance(distanceFromSite(t)),
  },
  { key: 'source', label: 'SRC', width: 4, figure: true, cell: (t) => sourceName(t.source) },
];

/** The grid the header and every row share: each column as wide as its text. */
const GRID = { '--columns': COLUMNS.map((c) => `${c.width}ch`).join(' ') };

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
      <div class={s.header} style={GRID}>
        <For each={COLUMNS}>
          {(c) => (
            <button
              type="button"
              class={cx(s.sort, c.figure && s.figure, listSort().key === c.key && s.sortActive)}
              onClick={() => setListSort((sort) => toggleSort(sort, c.key))}
            >
              {c.label}
              <span class={s.hang}>
                {listSort().key === c.key ? (listSort().dir === 'asc' ? '▴' : '▾') : ''}
              </span>
            </button>
          )}
        </For>
      </div>
      <div class={s.rows} style={GRID}>
        {/* By place, not by track: a snapshot brings new track objects, and a row is kept for its successor. */}
        <Index each={rows()}>
          {(t) => (
            <div
              class={cx(s.row, rowTone(t()), selected() === t().hex && s.selected)}
              onClick={() => setSelected(t().hex)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, items: targetMenu(t()) });
              }}
            >
              <For each={COLUMNS}>
                {(c) => (
                  <span class={cx(c.figure && s.figure, c.faint?.(t()) && s.hex)}>
                    {c.cell(t())}
                    {c.hang && <span class={s.hang}>{c.hang(t())}</span>}
                  </span>
                )}
              </For>
            </div>
          )}
        </Index>
      </div>
    </Window>
  );
}
