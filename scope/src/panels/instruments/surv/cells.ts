import { isStale } from '../../../render/scene/rules';
import type { Readout } from '../../../state/track';
import { HEARD } from '../../lanes/plots';
import { NONE, POSITION_LABEL, positionReading, type Reading, READINGS } from '../../readings';
import { holdsAll } from '../freshness';
import type { Moment } from '../moment';

export type SurvKey = 'pos' | 'nic' | 'nacp' | 'src' | 'rssi' | 'msgs' | 'age';

/** One cell of SURV: its label and reading, dimmed when the reading is unknown or does not hold. */
export interface SurvCell {
  key: SurvKey;
  k: string;
  r: Reading;
  dim: boolean;
}

/** The readings that lapse as their lanes do; the source, the signal and the rate never do. */
const LAPSING: ReadonlySet<SurvKey> = new Set(['nic', 'nacp']);

const READ_KEYS = ['nic', 'nacp', 'src', 'rssi', 'msgs', 'age'] as const;

const dash = (key: SurvKey, k: string): SurvCell => ({ key, k, r: NONE, dim: true });

const SURV_DASHES: SurvCell[] = [
  dash('pos', POSITION_LABEL),
  ...READ_KEYS.map((key) => dash(key, READINGS[key].label)),
];

/**
 * The cells of SURV in their order: the position, then the readings of the surveillance and the
 * reception; over a gap, every one a dimmed dash.
 */
export function survCells(m: Moment<Readout>): SurvCell[] {
  if (m.kind === 'empty') return SURV_DASHES;
  const { r: t, instant } = m;
  const position = positionReading(t.at);
  return [
    { key: 'pos', k: POSITION_LABEL, r: position, dim: t.at === undefined || isStale(t) },
    ...READ_KEYS.map((key) => {
      const lapsed = LAPSING.has(key) && !holdsAll(t, HEARD[key], instant);
      const r = lapsed ? NONE : READINGS[key].format(t);
      return { key, k: READINGS[key].label, r, dim: key === 'age' ? isStale(t) : r === NONE };
    }),
  ];
}
