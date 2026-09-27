/** Layers drawn from map data, back to front. They are built together. */
export const MAP_LAYERS = ['airways', 'airspace', 'sector', 'coast', 'fixes'] as const;

/** Every layer the scope draws, back to front: the rings, the map, then what moves over it. */
export const LAYER_ORDER = ['rings', ...MAP_LAYERS, 'targets', 'hover', 'overlays'] as const;

export type MapLayer = (typeof MAP_LAYERS)[number];
export type LayerName = (typeof LAYER_ORDER)[number];
