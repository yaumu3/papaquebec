import { For } from 'solid-js';

import { cx } from '../design/cx';
import { axisTicks, edgeSpread, scaleLabels, transitionLevel } from '../state/axis';
import {
  type Band,
  type BandLimits,
  formatEdge,
  fraction,
  parseEdge,
  withLower,
  withUpper,
} from '../state/band';
import { BAND_LIMITS } from '../state/filter';
import { setSettings, settings } from '../state/settings';
import { BandSlider, thumbPosition } from '../ui/BandSlider';

import s from './AltitudeAxis.module.css';

const TICK_EVERY = 100;
const TICKS = axisTicks(BAND_LIMITS, TICK_EVERY);
/** Least distance between scale labels, hundreds of feet: about one line of text. */
const LABEL_GAP = 25;
/** Thumb travel per drag notch, hundreds of feet. */
const DRAG_STEP = 10;
const AXIS_PX = 200;
const THUMB_PX = 10;
const GEOMETRY = { track: AXIS_PX - THUMB_PX, field: 22 };

const band = () => ({ lower: settings.filter.lowerFl, upper: settings.filter.upperFl });
const setBand = (b: Band) => setSettings('filter', { lowerFl: b.lower, upperFl: b.upper });
const at = (v: number) => thumbPosition(fraction(v, BAND_LIMITS));

/** A typed edge moves like a dragged thumb; unreadable input is put back as it was. */
function BandEdge(props: {
  label: string;
  value: number;
  side: 'above' | 'below';
  move: (b: Band, v: number, l: BandLimits) => Band;
}) {
  const nudge = () => edgeSpread(band(), BAND_LIMITS, GEOMETRY) * (props.side === 'above' ? 1 : -1);
  return (
    <div class={s.edge} style={{ bottom: `calc(${at(props.value)} + ${nudge()}px)` }}>
      <span class={s.lead} />
      <input
        type="text"
        maxlength={3}
        spellcheck={false}
        aria-label={props.label}
        value={formatEdge(props.value, BAND_LIMITS)}
        onChange={(e) => {
          const v = parseEdge(e.currentTarget.value, BAND_LIMITS);
          if (v === null) e.currentTarget.value = formatEdge(props.value, BAND_LIMITS);
          else setBand(props.move(band(), v, BAND_LIMITS));
        }}
      />
    </div>
  );
}

function Axis() {
  return (
    <div class={s.axis} style={{ height: `${AXIS_PX}px` }}>
      <div class={s.scale}>
        <For each={scaleLabels(TICKS, transitionLevel(settings.altimeter), LABEL_GAP)}>
          {(t) => (
            <span class={cx(s.tick, t.minor && s.minor)} style={{ bottom: at(t.at) }}>
              {t.label}
            </span>
          )}
        </For>
      </div>
      <BandSlider
        vertical
        min={BAND_LIMITS.min}
        max={BAND_LIMITS.max}
        step={DRAG_STEP}
        gap={BAND_LIMITS.gap}
        lower={settings.filter.lowerFl}
        upper={settings.filter.upperFl}
        onChange={(lo, hi) => setBand({ lower: lo, upper: hi })}
      />
      <div class={s.side}>
        <div class={s.ta} style={{ bottom: at(transitionLevel(settings.altimeter)) }} />
        <BandEdge label="Upper altitude" value={band().upper} side="above" move={withUpper} />
        <BandEdge label="Lower altitude" value={band().lower} side="below" move={withLower} />
      </div>
    </div>
  );
}

/** The altitude band as a vertical axis: scale on the left, edge fields riding the thumbs. */
export function AltitudeAxis() {
  return (
    <div class={s.altitude} style={{ '--thumb': `${THUMB_PX}px` }}>
      <Axis />
    </div>
  );
}
