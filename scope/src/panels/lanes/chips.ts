import { isInstrumentLane, type LaneKey } from '../../state/plotted';
import { LANE_LABELS } from '../readings';

/** A lane's chip in the palette: the lane the palette is for, one open elsewhere, or one free to pick. */
export type Chip = 'own' | 'open' | 'free';

/** The chip of `lane` in the palette of the lane `own`, or of a lane to add when null. */
export function chipOf(plotted: readonly LaneKey[], own: LaneKey | null, lane: LaneKey): Chip {
  if (lane === own) return 'own';
  return plotted.includes(lane) ? 'open' : 'free';
}

/** What the palette of the lane `own`, or of a lane to add when null, is called. */
export const pickerName = (own: LaneKey | null): string =>
  own === null ? 'Add a lane' : `${LANE_LABELS[own]} lane: pick a lane`;

/** What a lane at `index` of `count` is called, with how it is moved. */
export const laneName = (lane: LaneKey, index: number, count: number): string =>
  isInstrumentLane(lane)
    ? `${LANE_LABELS[lane]} lane, ${index + 1} of ${count}. Drag it, or press Alt and an arrow key, to move it; Delete removes it; Shift+F10 opens its menu.`
    : `${LANE_LABELS[lane]} lane, ${index + 1} of ${count}. Drag it up or down, or press Alt and an arrow key, to move it; drag it sideways to select a span; Delete removes it; Shift+F10 opens its menu. The left and right arrows pan the window, the up and down arrows narrow and widen it, Home resets it.`;

/** What the chip of `lane` is called beyond its text: that it is open already, which only a dot shows. */
export const chipName = (lane: LaneKey, chip: Chip): string | undefined =>
  chip === 'open' ? `${LANE_LABELS[lane]}, already open` : undefined;

/** What picking `lane` in the palette of `own`, or of a lane to add when null, does: take its place, join the column, or go to the lane open already. */
export function pickOf(
  plotted: readonly LaneKey[],
  own: LaneKey | null,
  lane: LaneKey,
): 'switch' | 'add' | 'reveal' {
  if (chipOf(plotted, own, lane) !== 'free') return 'reveal';
  return own === null ? 'add' : 'switch';
}
