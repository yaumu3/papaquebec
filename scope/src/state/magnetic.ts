import { createSignal } from 'solid-js';

/** Magnetic declination at the site, degrees east positive. */
export const [declination, setDeclination] = createSignal(0);
