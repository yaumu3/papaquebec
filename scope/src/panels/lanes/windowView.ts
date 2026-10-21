import { createMemo } from 'solid-js';

import { lanesView, setLanesWindow } from '../../state/lanes';
import { snapshotVersion } from '../../state/scope';
import type { Track } from '../../state/track';
import { trackStore } from '../../state/tracks';
import { contactOf, type LanesWindow, resolveWindow } from '../../state/window';

/** The window of a target's lanes as the column and its control both read it, and the way to change it. */
export function createWindowView(track: () => Track) {
  const hex = createMemo(() => track().hex);
  // A memo, so that scrolling the lanes, which keeps the window, redraws none of them.
  const lanesWindow = createMemo(() => lanesView(hex()).window);
  /** The samples, told apart from the last snapshot's though the store appends to one array. */
  const samples = createMemo(
    () => {
      snapshotVersion();
      return track().samples;
    },
    undefined,
    { equals: false },
  );
  const contact = createMemo(() => contactOf(samples(), trackStore.stats.now));
  const visible = createMemo(() => resolveWindow(lanesWindow(), contact()));
  const now = () => contact().to;
  const lag = () => now() - visible().to;
  const setWindow = (next: LanesWindow) => {
    if (next !== lanesWindow()) setLanesWindow(hex(), next);
  };
  return { hex, lanesWindow, samples, contact, visible, now, lag, setWindow };
}
