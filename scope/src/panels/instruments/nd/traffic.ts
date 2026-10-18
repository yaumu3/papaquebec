/**
 * The altitude of traffic relative to own ship in hundreds of feet, signed by the rounded value
 * so that level reads `+00`, at least two digits and never clipped. Halves round away from zero.
 */
export function relativeAltitudeLabel(deltaFt: number): string {
  const hundreds = Math.round(Math.abs(deltaFt) / 100);
  const sign = deltaFt < 0 && hundreds > 0 ? '-' : '+';
  return `${sign}${String(hundreds).padStart(2, '0')}`;
}
