import type { LaneKey } from '../../state/plotted';

/** A lane's chip in the palette: the lane the palette is for, one open elsewhere, or one free to pick. */
export type Chip = 'own' | 'open' | 'free';

/** The chip of `lane` in the palette of the lane `own`, or of a lane to add when null. */
export function chipOf(plotted: readonly LaneKey[], own: LaneKey | null, lane: LaneKey): Chip {
  if (lane === own) return 'own';
  return plotted.includes(lane) ? 'open' : 'free';
}
