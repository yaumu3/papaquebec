/**
 * What the visual tests shoot. A visit is one page load, the costly part, so as many images as can
 * share a state of the page come from one, in steps taken in turn.
 */
import type { Locator, Page } from 'playwright';

import { DRAW_STACK, LAYER_GROUPS } from '../../src/lib/layers';

/** XQPA, the example set's aerodrome. */
export const SITE = { lat: 33.5859, lon: 130.4508 };
const EXAMPLE_SET = 'schema/example.mapset.geojson';
const EXAMPLE_TITLE = 'Example map set (fictional)';
const NEAR_NM = 40;
const WIDE_NM = 200;

export interface Step {
  /** Puts the page in the state to shoot, from where the last step left it. */
  act?: (page: Page) => Promise<void>;
  /** The image of the whole page or of `of`. */
  name: string;
  of?: (page: Page) => Locator;
}

/** What a page imports through the Maps panel before its steps. */
interface Chart {
  title: string;
  file: { name: string; mimeType: string; buffer: Buffer } | string;
}

export interface Visit {
  settings: Record<string, unknown>;
  chart: Chart;
  steps: readonly Step[];
}

const NEAR_NORMAL = { rangeNm: NEAR_NM, labelDensity: 'normal' };
const EVERY_LAYER = Object.fromEntries(DRAW_STACK.map((layer) => [layer, true]));
const GROUPS = LAYER_GROUPS.map((group) => group.title);
const EXAMPLE: Chart = { title: EXAMPLE_TITLE, file: EXAMPLE_SET };

const mapsPanel = (page: Page) => page.getByRole('tree').locator('xpath=ancestor::div[2]');

const search = (page: Page, text: string) => page.getByLabel('Search layers').fill(text);

/** Searches for `text`, then points at the `nth` row whose name starts with `row`. */
const pointAt =
  (text: string, row: string, nth = 0) =>
  async (page: Page) => {
    await search(page, text);
    await page
      .getByRole('button', { name: new RegExp(`^${row}`) })
      .nth(nth)
      .hover();
  };

/** One click at a time: the top bar ignores clicks made together. */
const togglePanels = (page: Page) =>
  ['DISP', 'MAP', 'LIST', 'DETAIL'].reduce(
    (done, name) => done.then(() => page.getByRole('button', { name, exact: true }).click()),
    Promise.resolve(),
  );

export const VISITS: readonly Visit[] = [
  {
    settings: NEAR_NORMAL,
    chart: EXAMPLE,
    steps: [
      { name: 'map/search', act: pointAt('Q', 'QDG') },
      { name: 'map/pointed-airway', act: pointAt('V901', 'V901') },
      { name: 'map/pointed-procedure', act: pointAt('TAVRO2', 'TAVRO2') },
      { name: 'map/pointed-area', act: pointAt('PAPAQ', 'PAPAQ', 1) },
      { name: 'map/pointed-hold', act: pointAt('NIMBA', 'NIMBA', 1) },
      { name: 'map/default', act: togglePanels },
    ],
  },
  {
    settings: { rangeNm: NEAR_NM, labelDensity: 'dense', shownLayers: EVERY_LAYER },
    chart: EXAMPLE,
    steps: [{ name: 'map/every-layer', act: togglePanels }],
  },
  {
    settings: { rangeNm: WIDE_NM, labelDensity: 'dense', shownLayers: EVERY_LAYER },
    chart: EXAMPLE,
    steps: [{ name: 'map/wide', act: togglePanels }],
  },
  {
    settings: { rangeNm: NEAR_NM, openGroups: ['ROUTES'], openLayers: ['conv'] },
    chart: EXAMPLE,
    steps: [{ name: 'tree/search', act: (page) => search(page, 'A9'), of: mapsPanel }],
  },
  {
    settings: { rangeNm: NEAR_NM, openGroups: GROUPS, openLayers: ['navaid'] },
    chart: EXAMPLE,
    steps: [{ name: 'tree/swatches', of: mapsPanel }],
  },
];
