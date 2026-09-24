import { createSignal, For, Show } from 'solid-js';

import { importMapSet, importNote, mapSets, removeMapSet, toggleMapSet } from '../state/mapsets';
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

/** The chosen file goes through the strict schema; the note reports the outcome. */
function MapSetImport() {
  const [note, setNote] = createSignal<string | null>(null);
  let input: HTMLInputElement | undefined;
  const onFile = async (e: Event & { currentTarget: HTMLInputElement }) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setNote('could not read the file');
      return;
    }
    setNote(importNote(importMapSet(text)));
  };
  return (
    <>
      <button type="button" class={s.import} onClick={() => input?.click()}>
        IMPORT JSON…
      </button>
      <input
        ref={(node) => {
          input = node;
        }}
        type="file"
        accept=".json,application/json"
        class={s.file}
        onChange={(e) => void onFile(e)}
      />
      <Show when={note()}>
        <div class={s.note}>{note()}</div>
      </Show>
    </>
  );
}

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
      <SectionTitle>DATA</SectionTitle>
      <div class={s.sets}>
        <For each={mapSets()}>
          {(set) => (
            <div class={s.set}>
              <Toggle
                label={set.data.title}
                on={set.enabled}
                onToggle={() => toggleMapSet(set.id)}
              />
              <span class={s.fetched}>{set.data.fetched ?? ''}</span>
              <Show when={!set.builtin}>
                <button
                  type="button"
                  class={s.remove}
                  title="Remove"
                  onClick={() => removeMapSet(set.id)}
                >
                  ×
                </button>
              </Show>
            </div>
          )}
        </For>
        <MapSetImport />
      </div>
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
