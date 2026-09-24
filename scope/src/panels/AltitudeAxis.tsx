import { type Accessor, createMemo, For } from 'solid-js';

import { cx } from '../design/cx';
import {
  altitudeProfile,
  axisTicks,
  binIndex,
  displayLevel,
  edgeSpread,
  groundCount,
  scaleLabels,
  transitionLevel,
} from '../state/axis';
import {
  type Band,
  type BandLimits,
  formatEdge,
  fraction,
  parseEdge,
  withLower,
  withUpper,
} from '../state/band';
import { altitudeUnfiltered, BAND_LIMITS, FL_MAX, FL_MIN } from '../state/filter';
import { selected, snapshotVersion } from '../state/scope';
import { setSettings, settings } from '../state/settings';
import { trackStore } from '../state/tracks';
import { BandSlider, thumbPosition } from '../ui/BandSlider';

import s from './AltitudeAxis.module.css';

const TICK_EVERY = 100;
const TICKS = axisTicks(BAND_LIMITS, TICK_EVERY);
/** Least distance between scale labels, hundreds of feet: about one line of text. */
const LABEL_GAP = 25;
/** Profile bin, hundreds of feet. */
const BIN = 10;
/** Thumb travel per drag notch, hundreds of feet. */
const DRAG_STEP = 10;
const AXIS_PX = 200;
const THUMB_PX = 10;
const GEOMETRY = { track: AXIS_PX - THUMB_PX, field: 22 };
/** Height of one profile bin, pixels. */
const BIN_PX = (GEOMETRY.track * BIN) / (BAND_LIMITS.max - BAND_LIMITS.min);

const band = () => ({ lower: settings.filter.lowerFl, upper: settings.filter.upperFl });
const setBand = (b: Band) => setSettings('filter', { lowerFl: b.lower, upperFl: b.upper });
const at = (v: number) => thumbPosition(fraction(v, BAND_LIMITS));

/** Airborne targets per bin and those on the ground, on one scale, plus the selected target's bin. */
interface Traffic {
  profile: number[];
  ground: number;
  peak: number;
  picked: number | 'ground' | null;
}

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

/** Whether profile bin `i` lies wholly inside the band. */
const inBand = (i: number) =>
  BAND_LIMITS.min + i * BIN >= band().lower && BAND_LIMITS.min + (i + 1) * BIN <= band().upper;

/** Where the airborne traffic is right now: one bar per bin, lit while the bin lies inside the band. */
function Profile(props: { traffic: Accessor<Traffic> }) {
  return (
    <div class={s.profile}>
      <For each={props.traffic().profile}>
        {(n, i) => (
          <div
            class={cx(s.bar, inBand(i()) && s.lit, props.traffic().picked === i() && s.picked)}
            style={{
              bottom: at(BAND_LIMITS.min + i() * BIN),
              height: `${BIN_PX}px`,
              width: `${(n / props.traffic().peak) * 100}%`,
            }}
          />
        )}
      </For>
    </div>
  );
}

const groundOn = () => settings.filter.ground;

/** Ground traffic is the bin below 000, with its own switch in place of a thumb. */
function GroundRow(props: { traffic: Accessor<Traffic> }) {
  return (
    <div class={s.foot}>
      <button
        type="button"
        class={cx(s.gnd, groundOn() && s.gndOn)}
        aria-pressed={groundOn()}
        onClick={() => setSettings('filter', 'ground', (v) => !v)}
      >
        <span class={s.gndLabel}>GND</span>
        <span class={s.swatch} />
      </button>
      <div class={s.side}>
        <div
          class={cx(
            s.bar,
            s.gndBar,
            groundOn() && s.gndLit,
            props.traffic().picked === 'ground' && s.picked,
          )}
          style={{
            width: `${(props.traffic().ground / props.traffic().peak) * 100}%`,
            height: `${BIN_PX}px`,
          }}
        />
      </div>
    </div>
  );
}

/** The bin holding the selected target, so the eye can tell whether a thumb would cut it. */
function pickedBin(): number | 'ground' | null {
  const hex = selected();
  const t = hex === null ? undefined : trackStore.tracks.get(hex);
  if (t === undefined) return null;
  if (t.alt === 'ground') return 'ground';
  const level = displayLevel(t.alt, settings.altimeter);
  return level === null ? null : binIndex(level, BAND_LIMITS, BIN);
}

/** Back to the full band with ground traffic shown. */
const resetBand = () => setSettings('filter', { ground: true, lowerFl: FL_MIN, upperFl: FL_MAX });

function Axis(props: { traffic: Accessor<Traffic> }) {
  return (
    <div
      class={s.axis}
      style={{ height: `${AXIS_PX}px` }}
      title={altitudeUnfiltered(settings.filter) ? undefined : 'Double-click to reset'}
      onDblClick={resetBand}
    >
      <For each={TICKS}>{(t) => <div class={s.grid} style={{ bottom: at(t.at) }} />}</For>
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
        <Profile traffic={props.traffic} />
        <div class={s.ta} style={{ bottom: at(transitionLevel(settings.altimeter)) }} />
        <BandEdge label="Upper altitude" value={band().upper} side="above" move={withUpper} />
        <BandEdge label="Lower altitude" value={band().lower} side="below" move={withLower} />
      </div>
    </div>
  );
}

/** The altitude band as a vertical axis: scale on the left, edge fields riding the thumbs, GND at the foot. */
export function AltitudeAxis() {
  const traffic = createMemo<Traffic>(() => {
    snapshotVersion();
    const tracks = [...trackStore.tracks.values()];
    const profile = altitudeProfile(tracks, settings.altimeter, BAND_LIMITS, BIN);
    const ground = groundCount(tracks);
    return { profile, ground, peak: Math.max(1, ground, ...profile), picked: pickedBin() };
  });
  return (
    <div class={s.altitude} style={{ '--thumb': `${THUMB_PX}px` }}>
      <Axis traffic={traffic} />
      <GroundRow traffic={traffic} />
    </div>
  );
}
