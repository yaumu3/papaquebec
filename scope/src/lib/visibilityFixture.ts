/** States of layers for tests: shown or hidden, with the keys of the items that go against it. */

import type { LayerState } from './visibility';

export const shownExcept = (...exceptions: string[]): LayerState => ({
  mode: true,
  exceptions: new Set(exceptions),
});

export const hiddenExcept = (...exceptions: string[]): LayerState => ({
  mode: false,
  exceptions: new Set(exceptions),
});

/** A layer state as plain data, its exceptions as a list in order, for `toEqual`. */
export const plainState = ({ mode, exceptions }: LayerState) => ({
  mode,
  exceptions: [...exceptions],
});
