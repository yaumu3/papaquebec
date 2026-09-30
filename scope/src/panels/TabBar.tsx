import { cx } from '../design/cx';
import { activeSheet, toggleSheet } from '../state/layout';
import type { PanelId } from '../state/scope';

import s from './TabBar.module.css';

const TABS: [PanelId, string][] = [
  ['display', 'DISP'],
  ['maps', 'MAP'],
  ['list', 'LIST'],
  ['detail', 'DETAIL'],
];

/**
 * Phone-only panel switcher along the bottom edge, with the `i` that opens the about dialog;
 * hidden by CSS on wider screens.
 */
export function TabBar() {
  return (
    <nav class={s.bar}>
      {TABS.map(([id, label]) => (
        <button
          type="button"
          class={cx(s.tab, activeSheet() === id && s.on)}
          onClick={() => toggleSheet(id)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        class={cx(s.tab, s.about, activeSheet() === 'about' && s.on)}
        aria-label="About"
        onClick={() => toggleSheet('about')}
      >
        i
      </button>
    </nav>
  );
}
