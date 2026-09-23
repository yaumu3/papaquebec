import type { SquawkFilter } from '../state/filter';
import { qnhStation } from '../state/qnh';
import {
  QNH_MAX_INHG,
  QNH_MIN_INHG,
  setSettings,
  settings,
  STATION_RE,
  TRANSITION_ALT_MAX_FT,
} from '../state/settings';
import { BandSlider } from '../ui/BandSlider';
import { Field, FieldRow, FieldSlot } from '../ui/Field';
import { Pills } from '../ui/Pills';
import { Divider, SectionTitle } from '../ui/Section';
import { Toggle } from '../ui/Toggle';
import { Window } from '../ui/Window';

import s from './DisplayPanel.module.css';

const RANGES = {
  transitionAltFt: [0, TRANSITION_ALT_MAX_FT],
  qnhInHg: [QNH_MIN_INHG, QNH_MAX_INHG],
} as const;

/** Out-of-range or blank input leaves the setting as it was. */
function setAltimeterField(key: keyof typeof RANGES, value: number): void {
  const [min, max] = RANGES[key];
  if (Number.isFinite(value) && value >= min && value <= max) setSettings('altimeter', key, value);
}

/** A typed QNH is the operator's word: automatic updates stop until switched back on. */
function setManualQnh(value: number): void {
  setAltimeterField('qnhInHg', value);
  setSettings('qnh', 'auto', false);
}

/** Blank means "nearest airport"; anything else must look like an ICAO id. */
function setStation(input: string): void {
  const station = input.trim().toUpperCase();
  if (station === '' || STATION_RE.test(station)) setSettings('qnh', 'station', station);
}

const fl = (v: number) => `FL${String(v).padStart(3, '0')}`;

export function DisplayPanel() {
  return (
    <Window id="display" title="Display" class={s.panel}>
      <SectionTitle>VECTOR</SectionTitle>
      <Pills
        options={[
          { value: 0, label: 'OFF' },
          { value: 0.5, label: '30s' },
          { value: 1, label: '1m' },
          { value: 2, label: '2m' },
        ]}
        value={settings.vectorMin}
        onChange={(v) => setSettings('vectorMin', v)}
      />
      <SectionTitle>TRAIL</SectionTitle>
      <Pills
        options={[
          { value: 0, label: 'OFF' },
          { value: 30, label: '30s' },
          { value: 60, label: '1m' },
          { value: 120, label: '2m' },
        ]}
        value={settings.trailSec}
        onChange={(v) => setSettings('trailSec', v)}
      />
      <Divider />
      <SectionTitle lit={`${fl(settings.filter.lowerFl)} – ${fl(settings.filter.upperFl)}`}>
        ALTITUDE
      </SectionTitle>
      <BandSlider
        min={0}
        max={600}
        step={10}
        gap={10}
        lower={settings.filter.lowerFl}
        upper={settings.filter.upperFl}
        onChange={(lo, hi) => setSettings('filter', { lowerFl: lo, upperFl: hi })}
      />
      <SectionTitle>ALTIMETER</SectionTitle>
      <FieldRow>
        <Field label="TA ft">
          <input
            type="number"
            min={0}
            max={TRANSITION_ALT_MAX_FT}
            step={100}
            value={settings.altimeter.transitionAltFt}
            onChange={(e) => setAltimeterField('transitionAltFt', e.currentTarget.valueAsNumber)}
          />
        </Field>
        <Field label="QNH inHg">
          <input
            type="number"
            min={QNH_MIN_INHG}
            max={QNH_MAX_INHG}
            step={0.01}
            value={settings.altimeter.qnhInHg.toFixed(2)}
            onChange={(e) => setManualQnh(e.currentTarget.valueAsNumber)}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="STATION">
          <input
            type="text"
            maxlength={4}
            spellcheck={false}
            placeholder={qnhStation() || '----'}
            value={settings.qnh.station}
            onChange={(e) => setStation(e.currentTarget.value)}
          />
        </Field>
        <FieldSlot label="SOURCE">
          <Toggle
            label={settings.qnh.auto ? 'AUTO' : 'MANUAL'}
            on={settings.qnh.auto}
            onToggle={() => setSettings('qnh', 'auto', (v) => !v)}
          />
        </FieldSlot>
      </FieldRow>
      <SectionTitle>SQUAWK</SectionTitle>
      <Pills
        options={[
          { value: 'all', label: 'ALL' },
          { value: 'nonvfr', label: 'NON-VFR' },
          { value: 'emergency', label: 'EMERG' },
        ]}
        value={settings.filter.squawk}
        onChange={(v: SquawkFilter) => setSettings('filter', 'squawk', v)}
      />
    </Window>
  );
}
