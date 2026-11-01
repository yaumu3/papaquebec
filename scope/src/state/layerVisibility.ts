import { batch } from 'solid-js';

import type { ScopeLayer } from '../lib/mapsetFormat';
import { type LayerState, NO_EXCEPTIONS } from '../lib/visibility';
import { setSettings, settings } from './settings';

/** A layer's mode and exceptions as the settings hold them. */
export const layerState = (layer: ScopeLayer): LayerState => ({
  mode: settings.shownLayers[layer],
  exceptions: settings.exceptions[layer] ?? NO_EXCEPTIONS,
});

export function setLayerState(layer: ScopeLayer, { mode, exceptions }: LayerState): void {
  batch(() => {
    setSettings('shownLayers', layer, mode);
    setSettings('exceptions', layer, exceptions);
  });
}
