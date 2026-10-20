import type { LaneKey } from '../../state/plotted';
import { LANE_LABELS } from '../readings';

/** A lane's chip in the palette: the lane the palette is for, one open elsewhere, or one free to pick. */
export type Chip = 'own' | 'open' | 'free';

/** The chip of `lane` in the palette of the lane `own`, or of a lane to add when null. */
export function chipOf(plotted: readonly LaneKey[], own: LaneKey | null, lane: LaneKey): Chip {
  if (lane === own) return 'own';
  return plotted.includes(lane) ? 'open' : 'free';
}

/** What the palette of the lane `own`, or of a lane to add when null, is called. */
export const paletteName = (own: LaneKey | null): string =>
  own === null ? 'Add a lane' : `${LANE_LABELS[own]} lane: pick a lane`;

/** What a lane at `index` of `count` is called, with how it is moved. */
export const laneName = (lane: LaneKey, index: number, count: number): string =>
  `${LANE_LABELS[lane]} lane, ${index + 1} of ${count}. Drag it, or press Alt and an arrow key, to move it; Delete removes it.`;

/** What the chip of `lane` is called beyond its text: that it is open already, which only a dot shows. */
export const chipName = (lane: LaneKey, chip: Chip): string | undefined =>
  chip === 'open' ? `${LANE_LABELS[lane]}, already open` : undefined;
