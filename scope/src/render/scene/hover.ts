import type { Altimeter } from '../../lib/altitude';
import { type Filter, visibility } from '../../state/filter';
import type { Track } from '../../state/track';
import { blockCorner } from '../layout/labels';
import { type Batch, Shape } from '../protocol';
import { drawLeader } from './datablock';
import { LineBatch, MarkerBatch } from './pack';
import { THEME, trackColor } from './rules';
import { blockOffset, type LabelDrag } from './targets';

export interface HoverInput {
  /** The target under the pointer, if any. */
  track: Track | null;
  selected: string | null;
  filter: Filter;
  altimeter: Altimeter;
  labelDrag: LabelDrag | null;
}

/**
 * The hover highlight, drawn over the targets layer so a hover never rebuilds it: a box round
 * the target and its leader again at full brightness. The selected target is highlighted
 * already, and a filtered one has no block to lead to.
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
    drawLeader(lines, {
      at,
      ...blockOffset(t.hex, blockCorner(t.ops), input.labelDrag),
      color: trackColor(t, input.selected),
      emphasised: true,
    });
  }
  return [lines.finish(), markers.finish()];
}
