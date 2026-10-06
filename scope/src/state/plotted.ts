/** The readings of the detail table that the history lanes can plot. */
export const READING_KEYS = [
  'alt',
  'selAlt',
  'fmsAlt',
  'vs',
  'trk',
  'selHdg',
  'gs',
  'qnh',
  'modes',
  'ias',
  'tas',
  'mach',
  'wind',
  'oat',
  'tat',
  'nic',
  'nacp',
  'src',
  'rssi',
  'msgs',
  'age',
] as const;

export type ReadingKey = (typeof READING_KEYS)[number];

/** Plotted on first use. */
export const DEFAULT_PLOTTED: readonly ReadingKey[] = ['alt', 'selAlt', 'fmsAlt', 'gs'];
export const MAX_LANES = 4;

/** An intent reading is drawn in the lane of the reading it is an intent for, on its scale. */
const LANE_OF: Partial<Record<ReadingKey, ReadingKey>> = {
  selAlt: 'alt',
  fmsAlt: 'alt',
  selHdg: 'trk',
};

/** The reading whose lane `key` is drawn in: itself unless it is an intent. */
export const laneOf = (key: ReadingKey): ReadingKey => LANE_OF[key] ?? key;

/** The lanes open for `plotted`, each once, in order of the first reading drawn in it. */
export function lanesOf(plotted: readonly ReadingKey[]): ReadingKey[] {
  return [...new Set(plotted.map(laneOf))];
}

/** The readings drawn in `lane`: its own first, then the intents plotted in it, in their order. */
export function readingsIn(plotted: readonly ReadingKey[], lane: ReadingKey): ReadingKey[] {
  return [lane, ...plotted.filter((k) => k !== lane && laneOf(k) === lane)];
}

/** Removes the lane and every reading drawn in it. */
export function closeLane(plotted: readonly ReadingKey[], lane: ReadingKey): ReadingKey[] {
  return plotted.filter((k) => laneOf(k) !== lane);
}

/**
 * The plotted readings after a tap on `key`: off when on; else on, opening its lane when that is
 * not open yet, unless the lane would be one past the limit, when nothing changes.
 */
export function togglePlotted(plotted: readonly ReadingKey[], key: ReadingKey): ReadingKey[] {
  if (plotted.includes(key)) return plotted.filter((k) => k !== key && laneOf(k) !== key);
  const lane = laneOf(key);
  const lanes = lanesOf(plotted);
  if (lanes.includes(lane)) return [...plotted, key];
  if (lanes.length >= MAX_LANES) return [...plotted];
  return lane === key ? [...plotted, key] : [...plotted, lane, key];
}

/** Moves the lane at `from` to `to`, the readings drawn in each lane travelling together. */
export function moveLane(plotted: readonly ReadingKey[], from: number, to: number): ReadingKey[] {
  const lanes = lanesOf(plotted);
  const [moved] = lanes.splice(from, 1);
  if (moved !== undefined) lanes.splice(to, 0, moved);
  return lanes.flatMap((lane) => readingsIn(plotted, lane));
}
