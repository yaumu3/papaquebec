import { cx } from '../design/cx';
import { activeSheet, toggleSheet } from '../state/layout';
import { PANEL_IDS, PANEL_NAMES } from '../state/settingsDefaults';

import s from './TabBar.module.css';

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
          {PANEL_NAMES[id]}
        </button>
      ))}
    </nav>
  );
}
