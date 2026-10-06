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
    drawLeader(lines, {
      at,
      ...blockOffset(t.hex, blockCorner(t.ops), input.labelDrag),
      color: trackColor(t, input.selected),
      emphasised: true,
    });
  }
  if (input.instant) markers.marker(input.instant, Shape.Ring, RING_PX, THEME.selbox);
  return [lines.finish(), markers.finish()];
}
