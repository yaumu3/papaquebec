import { isStale } from '../../../render/scene/rules';
import { NONE, positionReading, type Reading, READINGS } from '../../readings';
import type { Moment } from '../moment';

export type SurvKey = 'pos' | 'nic' | 'nacp' | 'src' | 'rssi' | 'msgs' | 'age';

/** One cell of SURV: its label and reading, dimmed when the reading is unknown or does not hold. */
export interface SurvCell {
  key: SurvKey;
  k: string;
  r: Reading;
  dim: boolean;
}

const READ_KEYS = ['nic', 'nacp', 'src', 'rssi', 'msgs', 'age'] as const;

/** The cells of SURV in their order: the position, then the readings of the surveillance and the reception. */
export function survCells({ r: t }: Moment): SurvCell[] {
  const position = positionReading(t.at);
  return [
    { key: 'pos', k: position.k, r: position.r, dim: t.at === undefined },
    ...READ_KEYS.map((key) => {
      const r = READINGS[key].format(t);
      return { key, k: READINGS[key].label, r, dim: key === 'age' ? isStale(t) : r === NONE };
    }),
  ];
}
