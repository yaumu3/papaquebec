import { arcPoints, type Stroke } from './figure';
import { magneticToTrue, type Vec2 } from './geo';
import type { HoldProperties } from './mapset';

/**
 * The leg and the width take the proportions of a flown hold: a one-minute leg is about 1.5
 * times the standard-rate turn diameter.
 */
const LEG_PX = 18;
const WIDTH_PX = 12;
const OUTLINE_WIDTH = 1;
const CHEVRON_WIDTH = 1.2;
const CHEVRON_BACK_PX = 5;
const CHEVRON_WING_PX = 3;
const HALF_CIRCLE_STEPS = 8;

/**
 * A hold's drawing about its fix at the origin, in CSS px, y down: the outline and a chevron on
 * each leg.
 */
export interface Racetrack {
  outline: Stroke;
  chevrons: [Stroke, Stroke];
}

const along = (from: Vec2, direction: Vec2, distance: number): Vec2 => ({
  x: from.x + direction.x * distance,
  y: from.y + direction.y * distance,
});

const angleOf = ({ x, y }: Vec2): number => (Math.atan2(y, x) * 180) / Math.PI;

function chevron(tip: Vec2, flow: Vec2): Stroke {
  const back = along(tip, flow, -CHEVRON_BACK_PX);
  const wing = { x: -flow.y, y: flow.x };
  return {
    points: [along(back, wing, CHEVRON_WING_PX), tip, along(back, wing, -CHEVRON_WING_PX)],
    closed: false,
    width: CHEVRON_WIDTH,
  };
}

/**
 * The racetrack of a hold, from the direction of its inbound track on the screen (a unit
 * vector, y down): the inbound leg ends at the fix, the outbound leg lies to the side the hold
 * turns to, as seen flying inbound, and half circles join them. The outline runs from the fix.
 */
export function racetrack(inbound: Vec2, turn: 'L' | 'R'): Racetrack {
  const side = turn === 'R' ? 1 : -1;
  const normal = { x: -inbound.y * side, y: inbound.x * side };
  const fix = { x: 0, y: 0 };
  const start = along(fix, inbound, -LEG_PX);
  const sweep = 180 * side;
  const normalAngle = angleOf(normal);
  const radius = WIDTH_PX / 2;
  const roundFix = arcPoints(
    along(fix, normal, radius),
    radius,
    normalAngle + 180,
    normalAngle + 180 + sweep,
    HALF_CIRCLE_STEPS,
  );
  const roundStart = arcPoints(
    along(start, normal, radius),
    radius,
    normalAngle,
    normalAngle + sweep,
    HALF_CIRCLE_STEPS,
  );
  return {
    outline: { points: [...roundFix, ...roundStart], closed: true, width: OUTLINE_WIDTH },
    chevrons: [
      chevron(along(start, inbound, LEG_PX / 2), inbound),
      chevron(along(along(start, inbound, LEG_PX / 2), normal, WIDTH_PX), {
        x: -inbound.x,
        y: -inbound.y,
      }),
    ],
  };
}

/**
 * The inbound track of a hold in degrees true: `inboundTrue`, else `inboundMag` turned by the
 * declination at the fix, which is read only then.
 */
export function inboundTrack(
  hold: Pick<HoldProperties, 'inboundTrue' | 'inboundMag'>,
  declinationAtFix: () => number,
): number {
  if (hold.inboundTrue !== undefined) return hold.inboundTrue;
  return magneticToTrue(hold.inboundMag ?? 0, declinationAtFix());
}
