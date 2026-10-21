import { isStale } from '../../../render/scene/rules';
import { HEARD } from '../../lanes/plots';
import { NONE, positionReading, type Reading, READINGS } from '../../readings';
import { holdsAll } from '../freshness';
import type { Present } from '../moment';

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

/** The cells of SURV in their order: the position, then the readings of the surveillance and the reception. */
export function survCells({ r: t, instant }: Present): SurvCell[] {
  const position = positionReading(t.at);
  return [
    { key: 'pos', k: position.k, r: position.r, dim: t.at === undefined || isStale(t) },
    ...READ_KEYS.map((key) => {
      const lapsed = LAPSING.has(key) && !holdsAll(t, HEARD[key], instant);
      const r = lapsed ? NONE : READINGS[key].format(t);
      return { key, k: READINGS[key].label, r, dim: key === 'age' ? isStale(t) : r === NONE };
    }),
  ];
}
