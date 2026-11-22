import { onCleanup } from 'solid-js';

import { cx } from '../design/cx';
import { activeSheet, toggleSheet } from '../state/layout';
import { PANEL_IDS, type PanelId } from '../state/settingsDefaults';
import { trackNavInset } from '../ui/navInset';
import { InfoBlock } from './InfoBlock';
import { NAV_ICONS } from './navIcons';

import s from './NavBar.module.css';

const NAMES: Record<PanelId, string> = {
  display: 'Display',
  maps: 'Maps',
  list: 'List',
  detail: 'Detail',
};

const [LEFT, RIGHT] = [PANEL_IDS.slice(0, 2), PANEL_IDS.slice(2)];

function PanelButtons(props: { ids: readonly PanelId[] }) {
  return (
    <div class={s.pair}>
      {props.ids.map((id) => (
        <button
          type="button"
          class={cx(s.btn, activeSheet() === id && s.on)}
          aria-label={NAMES[id]}
          aria-pressed={activeSheet() === id}
          onClick={() => toggleSheet(id)}
        >
          {NAV_ICONS[id]()}
        </button>
      ))}
    </div>
  );
}

/** Phone-only floating bar that opens the panels; hidden by CSS on wider screens. */
export function NavBar() {
  return (
    <nav
      class={s.bar}
      aria-label="Panels and status"
      ref={(node) => onCleanup(trackNavInset(node))}
    >
      <PanelButtons ids={LEFT} />
      <InfoBlock />
      <PanelButtons ids={RIGHT} />
    </nav>
  );
}
