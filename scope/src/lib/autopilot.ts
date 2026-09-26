/** The readouts that tell whether the heading bug steers the aircraft. */
export interface HeadingSelection {
  selHeading: number | undefined;
  navModes: string[] | undefined;
}

/**
 * The selected heading while it steers the aircraft, else undefined. DO-260B carries no heading
 * source flag, only mode bits, which many aircraft leave out: LNAV or an approach (the localizer)
 * flies it instead, and an A320-family FCU in managed NAV, window dashed, reports 0 with no modes.
 */
export function steeringHeading(s: HeadingSelection): number | undefined {
  const modes = s.navModes;
  if (modes?.includes('lnav') || modes?.includes('approach')) return undefined;
  if (s.selHeading === 0 && modes === undefined) return undefined;
  return s.selHeading;
}
