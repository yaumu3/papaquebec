import { cx } from '../design/cx';
import { activeSheet, toggleSheet } from '../state/layout';
import type { PanelId } from '../state/scope';
import { PANEL_IDS } from '../state/settingsDefaults';

import s from './TabBar.module.css';

const LABELS: Record<PanelId, string> = {
  display: 'DISPLAY',
  maps: 'MAPS',
  list: 'LIST',
  detail: 'DETAIL',
};

/** Phone-only panel switcher along the bottom edge; hidden by CSS on wider screens. */
export function TabBar() {
  return (
    <nav class={s.bar}>
      {PANEL_IDS.map((id) => (
        <button
          type="button"
          class={cx(s.tab, activeSheet() === id && s.on)}
          onClick={() => toggleSheet(id)}
        >
          {LABELS[id]}
        </button>
      ))}
    </nav>
  );
}
