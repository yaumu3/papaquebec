import { For } from 'solid-js';

import { aero } from '../state/scope';
import {
  activePreset,
  applyPreset,
  type LabelDensity,
  type LayerKey,
  type MapPreset,
  setSettings,
  settings,
  toggleLayer,
} from '../state/settings';
import { Pills } from '../ui/Pills';
import { Divider, SectionTitle } from '../ui/Section';
import { Toggle } from '../ui/Toggle';
import { Window } from '../ui/Window';

import s from './MapsPanel.module.css';

const LAYERS: [LayerKey, string][] = [
  ['coast', 'Coast'],
  ['airspace', 'Airspace'],
  ['waypoints', 'Waypts'],
  ['airways', 'Airways'],
  ['navaids', 'Navaids'],
  ['rings', 'Rings'],
  ['sector', 'Sector'],
  ['airports', 'Airports'],
];

export function MapsPanel() {
  return (
    <Window id="maps" title="Maps" class={s.panel}>
      <SectionTitle>PRESET</SectionTitle>
      <Pills
        small
        options={[
          { value: 'approach', label: 'APPROACH' },
          { value: 'enroute', label: 'EN ROUTE' },
          { value: 'minimal', label: 'MIN' },
          { value: 'all', label: 'ALL' },
        ]}
        value={activePreset()}
        onChange={(v: MapPreset) => applyPreset(v)}
      />
      <SectionTitle>LAYERS</SectionTitle>
      <div class={s.layers}>
        <For each={LAYERS}>
          {([key, label]) => (
            <Toggle label={label} on={settings.layers[key]} onToggle={() => toggleLayer(key)} />
          )}
        </For>
      </div>
      <Divider />
      <SectionTitle lit={`openAIP · ${aero().fetched ?? '----'}`}>DATA</SectionTitle>
      <Divider />
      <SectionTitle>LABEL DENSITY</SectionTitle>
      <Pills
        options={[
          { value: 'off', label: 'OFF' },
          { value: 'sparse', label: 'SPARSE' },
          { value: 'normal', label: 'NORMAL' },
          { value: 'dense', label: 'DENSE' },
        ]}
        value={settings.labelDensity}
        onChange={(v: LabelDensity) => setSettings('labelDensity', v)}
      />
    </Window>
  );
}
