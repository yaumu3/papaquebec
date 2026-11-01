import type { ChartItem, ItemPart } from '../../lib/chart';
import type { Figure } from '../../lib/figure';
import { bearingOnScreen, northAt, type ProjectFn, type Vec2 } from '../../lib/geo';
import { LAYER_TABLE } from '../../lib/layers';
import { inboundTrack, type Racetrack, racetrack } from '../../lib/racetrack';
import type { Declination } from '../../lib/wmm';
import { type FigureOut, putFigure } from './figures';

/** A hold's racetrack and where its fix stands on the plane. */
export interface PlacedRacetrack {
  at: Vec2;
  racetrack: Racetrack;
}

/**
 * The racetrack of a hold part, oriented by true north at its fix on the plane. The declination
 * is read only for a hold without `inboundTrue`. Nothing for a part that is not a hold.
 */
export function racetrackAt(
  { geometry, properties }: ItemPart,
  project: ProjectFn,
  declinationAt: () => Declination,
): PlacedRacetrack | undefined {
  if (!('turn' in properties) || geometry.type !== 'Point') return undefined;
  const [lon, lat] = geometry.coordinates;
  const track = inboundTrack(properties, () => declinationAt()(lat, lon));
  const inbound = bearingOnScreen(northAt(project, lat, lon), track);
  return { at: project(lat, lon), racetrack: racetrack(inbound, properties.turn) };
}

const figureOf = ({ outline, chevrons }: Racetrack): Figure => ({
  strokes: [outline, ...chevrons],
  discs: [],
});

/** The racetracks of the hold items, each in the colour of its kind. */
export function drawHolds(
  items: readonly ChartItem[],
  project: ProjectFn,
  declinationAt: () => Declination,
  out: FigureOut,
): void {
  const style = LAYER_TABLE.hold.style;
  for (const item of items.filter(({ layer }) => layer === 'hold')) {
    for (const part of item.parts) {
      const placed = racetrackAt(part, project, declinationAt);
      const color = part.properties.kind === 'RNAV' ? style.rnavColor : style.color;
      if (placed) putFigure(out, placed.at, figureOf(placed.racetrack), color);
    }
  }
}
