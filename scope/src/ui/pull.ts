/** How far a pointer travels before it is a pull rather than a tap, CSS px. */
export const PULL_PX = 10;

/** How far back a pull's speed is measured from where it lets go, ms. */
const SPEED_WINDOW_MS = 100;

/**
 * Tells what a pointer does to a phone's sheet, on its grabber or its content: a tap, or a pull
 * that drags the sheet by how far the pointer has come up and lets it go at the speed it lifted off
 * at. A mouse ends a pull in a click as well, which a finger does not, so the click after a pull
 * counts for nothing.
 */
export function trackPull(sheet: {
  tap: () => void;
  drag: (travel: number) => void;
  release: (velocity: number) => void;
}) {
  let landedAt = 0;
  let pressed = false;
  let pulled = false;
  let samples: { y: number; t: number }[] = [];

  const velocity = () => {
    const first = samples[0];
    const last = samples.at(-1);
    if (!first || !last || last.t === first.t) return 0;
    return (first.y - last.y) / (last.t - first.t);
  };

  /** Forgets the moves made too long before `t` to count toward the speed. */
  const forget = (t: number) => {
    samples = samples.filter((s) => t - s.t <= SPEED_WINDOW_MS);
  };

  const move = (y: number, t: number): void => {
    if (!pressed) return;
    samples.push({ y, t });
    forget(t);
    if (!pulled && Math.abs(y - landedAt) < PULL_PX) return;
    pulled = true;
    sheet.drag(landedAt - y);
  };

  return {
    down(y: number, t: number): void {
      landedAt = y;
      pressed = true;
      pulled = false;
      samples = [{ y, t }];
    },
    move,
    /** A lift where the pointer last moved adds no move, so that it does not slow the flick. */
    up(y: number, t: number): void {
      if (samples.at(-1)?.y === y) forget(t);
      else move(y, t);
      if (pressed && pulled) sheet.release(velocity());
      pressed = false;
    },
    click(): void {
      if (!pulled) sheet.tap();
      pulled = false;
    },
  };
}
