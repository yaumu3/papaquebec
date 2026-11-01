/** States of layers for tests: shown or hidden, with the keys of the items that go against it. */

import { type LayerState, NO_EXCEPTIONS } from './visibility';

export const shownExcept = (...exceptions: string[]): LayerState => ({
  mode: true,
  exceptions: new Set(exceptions),
});

export const hiddenExcept = (...exceptions: string[]): LayerState => ({
  mode: false,
  exceptions: new Set(exceptions),
});

/** Every layer shown and no item against it. */
export const allShown = (): LayerState => ({ mode: true, exceptions: NO_EXCEPTIONS });

/** A layer state as plain data, its exceptions as a list in order, for `toEqual`. */
export const plainState = ({ mode, exceptions }: LayerState) => ({
  mode,
  exceptions: [...exceptions],
});
