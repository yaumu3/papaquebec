import type { Altimeter } from '../../lib/altitude';
import { blockHeight } from '../../lib/datablock';
import { type Filter, visibility } from '../../state/filter';
import type { Track } from '../../state/track';
import type { Move } from '../layout/moves';
import { type Batch, Shape } from '../protocol';
import { drawLeader, extraLines } from './datablock';
import { LineBatch, MarkerBatch } from './pack';
import { THEME, trackColor } from './rules';
import { drawnOffset, type LabelDrag } from './targets';

export interface HoverInput {
  /** The target under the pointer, if any. */
  track: Track | null;
  selected: string | null;
  filter: Filter;
  altimeter: Altimeter;
  labelDrag: LabelDrag | null;
  /** Blocks sliding to a new bearing, by hex, and the moment they are drawn at on their clock. */
  moves: ReadonlyMap<string, Move>;
  drawAt: number;
  /** Where the selected target was at the instant hovered on the history lanes, if it was anywhere. */
  instant: { x: number; y: number } | null;
}

const RING_PX = 14;

/**
 * The hover highlight, drawn over the targets layer so a hover never rebuilds it: a box round
 * the target and its leader again at full brightness, and a ring on the trail at the instant
 * hovered on the history lanes. The selected target is highlighted already, and a filtered one
 * has no block to lead to.
 */
export function buildHover(input: HoverInput): Batch[] {
  const lines = new LineBatch(1);
  const markers = new MarkerBatch(1);
  const t = input.track;
  const p = t?.position;
  if (
    t &&
    p &&
    (p.kind === 'live' || p.kind === 'last') &&
    t.hex !== input.selected &&
    visibility(t, input.selected, input.filter, input.altimeter) === 'shown'
  ) {
    const at = { x: p.x, y: p.y };
    markers.marker(at, Shape.HollowSquare, 14, THEME.hover);
    drawLeader(
      lines,
      {
        at,
        ...drawnOffset(t, input.labelDrag, input.moves, input.drawAt),
        color: trackColor(t, input.selected),
        emphasised: true,
      },
      blockHeight(extraLines(t)),
    );
  }
  if (input.instant) markers.marker(input.instant, Shape.Ring, RING_PX, THEME.selbox);
  return [lines.finish(), markers.finish()];
}
