import type { Batch } from './protocol';

/** Slots drawn from map data, back to front. They are built together. */
export const MAP_SLOTS = ['airways', 'airspace', 'sector', 'coast', 'fixes'] as const;

/** Every slot the scope draws, back to front: the rings, the map, then what moves over it. */
export const SLOT_ORDER = ['rings', ...MAP_SLOTS, 'targets', 'hover', 'overlays'] as const;

export type MapSlot = (typeof MAP_SLOTS)[number];
export type SlotName = (typeof SLOT_ORDER)[number];

/** The batches a builder hands the renderer, by the slots it fills. */
export type Slots = Partial<Record<SlotName, Batch[]>>;
