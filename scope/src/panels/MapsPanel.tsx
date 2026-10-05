import { createSignal, For, Show } from 'solid-js';

import { cx } from '../design/cx';
import {
  armRemoval,
  importMapSet,
  importNote,
  type MapSet,
  mapSets,
  removeMapSet,
  toggleMapSet,
} from '../state/mapsets';
import {
  type LabelDensity,
  type LayerKey,
  setSettings,
  settings,
  toggleLayer,
} from '../state/settings';
import { Button } from '../ui/Button';
import { Pills } from '../ui/Pills';
import { Divider, SectionTitle } from '../ui/Section';
import { Window } from '../ui/Window';

import s from './MapsPanel.module.css';

const LAYERS: [LayerKey, string][] = [
  ['coast', 'COAST'],
  ['airspace', 'AIRSPACE'],
  ['waypoints', 'WAYPTS'],
  ['airways', 'AIRWAYS'],
  ['navaids', 'NAVAIDS'],
  ['rings', 'RINGS'],
  ['sector', 'SECTOR'],
  ['airports', 'AIRPORTS'],
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
      <Button class={s.import} onClick={() => input?.click()}>
        IMPORT JSON…
      </Button>
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

/** One source: its toggle, and for an imported set the two-step remove control. */
function MapSetRow(props: {
  set: MapSet;
  armed: boolean;
  onRemoveClick: () => void;
  onDisarm: () => void;
}) {
  return (
    <div class={s.set}>
      <Button class={s.setToggle} on={props.set.enabled} onClick={() => toggleMapSet(props.set.id)}>
        {props.set.data.title}
      </Button>
      <Show when={!props.set.builtin}>
        <button
          type="button"
          class={cx(s.remove, props.armed && s.armed)}
          title="Remove"
          aria-label={
            props.armed
              ? `Confirm removing ${props.set.data.title}`
              : `Remove ${props.set.data.title}`
          }
          onClick={() => props.onRemoveClick()}
          onKeyDown={(e) => e.key === 'Escape' && props.onDisarm()}
        >
          {props.armed ? 'REMOVE' : '×'}
        </button>
        <Show when={props.armed}>
          <Button class={s.cancel} onClick={() => props.onDisarm()}>
            CANCEL
          </Button>
        </Show>
      </Show>
    </div>
  );
}

/** The sources list with its import control. Removal is armed on one set at a time. */
function MapSetList() {
  const [armed, setArmed] = createSignal<string | null>(null);
  const clickRemove = (id: string) => {
    const next = armRemoval(armed(), id);
    setArmed(next.armed);
    if (next.remove) removeMapSet(next.remove);
  };
  return (
    <div class={s.sets}>
      <For each={mapSets()}>
        {(set) => (
          <MapSetRow
            set={set}
            armed={armed() === set.id}
            onRemoveClick={() => clickRemove(set.id)}
            onDisarm={() => setArmed(null)}
          />
        )}
      </For>
      <MapSetImport />
    </div>
  );
}

export function MapsPanel() {
  return (
    <Window id="maps" title="Maps">
      <SectionTitle>LAYERS</SectionTitle>
      <div class={s.layers}>
        <For each={LAYERS}>
          {([key, label]) => (
            <Button on={settings.layers[key]} onClick={() => toggleLayer(key)}>
              {label}
            </Button>
          )}
        </For>
      </div>
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
      <Divider />
      <SectionTitle>SOURCES</SectionTitle>
      <MapSetList />
    </Window>
  );
}
