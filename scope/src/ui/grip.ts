/** How far a pointer travels on the grip before it is a pull rather than a tap, CSS px. */
export const PULL_PX = 10;

/**
 * Tells what is done to the grip of a phone's sheet, from where a pointer lands on it and lifts
 * off: a tap closes the sheet, and so does a pull down. A mouse ends a pull in a click as well,
 * which a finger does not, so the click after a pull counts for nothing.
 */
export function trackGrip(close: () => void) {
  let landedAt = 0;
  let pulled = false;
  return {
    down(y: number): void {
      landedAt = y;
      pulled = false;
    },
    up(y: number): void {
      const travel = y - landedAt;
      if (Math.abs(travel) < PULL_PX) return;
      pulled = true;
      if (travel > 0) close();
    },
    click(): void {
      if (!pulled) close();
      pulled = false;
    },
  };
}
