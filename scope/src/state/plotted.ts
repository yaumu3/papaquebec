/** The readings of a target the history lanes draw. */
export const READING_KEYS = [
  'alt',
  'selAlt',
  'fmsAlt',
  'vs',
  'trk',
  'selHdg',
  'roll',
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

/** The lanes by group, in the order the palette offers them. */
export const LANE_GROUPS = [
  { name: 'FLT', lanes: ['alt', 'vs', 'gs', 'trk', 'roll'] },
  { name: 'NAV', lanes: ['qnh', 'modes'] },
  { name: 'AIR', lanes: ['ias', 'tas', 'mach', 'wind', 'oat', 'tat'] },
  { name: 'POS', lanes: ['nic', 'nacp'] },
  { name: 'RX', lanes: ['src', 'rssi', 'msgs', 'age'] },
] as const satisfies readonly { name: string; lanes: readonly ReadingKey[] }[];

/** A reading with a lane of its own. */
export type LaneKey = (typeof LANE_GROUPS)[number]['lanes'][number];

export const LANE_KEYS: readonly LaneKey[] = LANE_GROUPS.flatMap((g) => g.lanes);

export const isLaneKey = (k: unknown): k is LaneKey => LANE_KEYS.some((lane) => lane === k);

/** The intents drawn in a lane, on its scale, whenever reported. */
export const INTENTS: Partial<Record<LaneKey, readonly ReadingKey[]>> = {
  alt: ['selAlt', 'fmsAlt'],
  trk: ['selHdg'],
};

/** The readings drawn in a lane: its own first, then its intents. */
export const readingsIn = (lane: LaneKey): ReadingKey[] => [lane, ...(INTENTS[lane] ?? [])];

/** Plotted on first use. */
export const DEFAULT_PLOTTED: readonly LaneKey[] = ['alt', 'gs'];

export function removeLane(plotted: readonly LaneKey[], lane: LaneKey): LaneKey[] {
  return plotted.filter((k) => k !== lane);
}

/** Moves the lane at `from` to `to`. */
export function moveLane(plotted: readonly LaneKey[], from: number, to: number): LaneKey[] {
  const lanes = [...plotted];
  const [moved] = lanes.splice(from, 1);
  if (moved !== undefined) lanes.splice(to, 0, moved);
  return lanes;
}

/** The lanes with `to` in the place of `from`, unless `to` is open already or `from` is not. */
export function switchLane(plotted: readonly LaneKey[], from: LaneKey, to: LaneKey): LaneKey[] {
  if (plotted.includes(to)) return [...plotted];
  return plotted.map((k) => (k === from ? to : k));
}

/** The lanes with `lane` at the end, unless it is open already. */
export function addLane(plotted: readonly LaneKey[], lane: LaneKey): LaneKey[] {
  return plotted.includes(lane) ? [...plotted] : [...plotted, lane];
}

/** The lane that follows `lane`; null after the last, or for one not open. */
export function laneAfter(plotted: readonly LaneKey[], lane: LaneKey): LaneKey | null {
  const at = plotted.indexOf(lane);
  return at < 0 ? null : (plotted[at + 1] ?? null);
}
