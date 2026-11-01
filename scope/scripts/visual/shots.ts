/**
 * What the visual tests shoot. A visit is one page load, the costly part, so as many images as can
 * share a state of the page come from one, in steps taken in turn.
 */
import type { Locator, Page } from 'playwright';

import { DRAW_STACK, LAYER_GROUPS } from '../../src/lib/layers';
import { FL_MAX } from '../../src/state/filter';
import { onScope, type Place } from './grid';
import { DRIFTING, FLEET, type Flight, placeOf } from './traffic';

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
  chart?: Chart;
  /** Flown over a scope with no chart. */
  fleet?: readonly Flight[];
  /** The lanes of the detail column, if not the default ones. */
  plotted?: readonly string[];
  steps: readonly Step[];
}

const NEAR_NORMAL = { rangeNm: NEAR_NM, labelDensity: 'normal' };
const EVERY_LAYER = Object.fromEntries(DRAW_STACK.map((layer) => [layer, true]));
const GROUPS = LAYER_GROUPS.map((group) => group.title);
const EXAMPLE: Chart = { title: EXAMPLE_TITLE, file: EXAMPLE_SET };

const mapsPanel = (page: Page) => page.getByRole('tree').locator('xpath=ancestor::div[2]');
const detailPanel = (page: Page) => page.locator('[data-lanes]').locator('xpath=ancestor::div[2]');
const historyLane = (page: Page) => page.locator('[data-lane="history"]').first();

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

const select = (flight: string) => (page: Page) => page.getByText(flight, { exact: true }).click();

const detail = (name: string, flight: string): Step => ({
  name,
  act: select(flight),
  of: detailPanel,
});

const TEST01 = placeOf('TEST01');
const TEST05 = placeOf('TEST05');
const TEST07 = placeOf('TEST07');
const OPEN_WATER: Place = [12, -12];

/** Clicks the two ends of an RBL under way, or of a new one. */
async function endRbl(page: Page, at: Place): Promise<void> {
  await page.mouse.click(...onScope(at));
}

async function startRbl(page: Page, at: Place): Promise<void> {
  await page.keyboard.press('r');
  await endRbl(page, at);
}

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
  {
    settings: NEAR_NORMAL,
    fleet: FLEET,
    steps: [
      { name: 'traffic/scope', act: togglePanels },
      {
        act: async (page) => {
          await togglePanels(page);
          await select('TEST01')(page);
        },
        name: 'traffic/overview',
      },
      { name: 'lanes/peek', act: (page) => historyLane(page).hover() },
      {
        name: 'lanes/picker',
        act: (page) => historyLane(page).click({ button: 'right' }),
      },
      {
        name: 'traffic/selected',
        act: async (page) => {
          await page.keyboard.press('Escape');
          await togglePanels(page);
          await page.mouse.move(...onScope(TEST05));
        },
      },
      {
        name: 'traffic/rbl-pending',
        act: async (page) => {
          await startRbl(page, TEST01);
          await page.mouse.move(...onScope(OPEN_WATER));
        },
      },
      {
        name: 'traffic/rbl',
        act: async (page) => {
          await endRbl(page, OPEN_WATER);
          await startRbl(page, TEST05);
          await endRbl(page, TEST07);
          await page.mouse.move(...onScope(OPEN_WATER));
        },
      },
      {
        name: 'traffic/range-cursor',
        act: async (page) => {
          await page.mouse.move(...onScope(TEST01));
          await page.mouse.down({ button: 'right' });
          await page.mouse.move(...onScope(OPEN_WATER), { steps: 4 });
        },
      },
    ],
  },
  {
    settings: {
      ...NEAR_NORMAL,
      filter: { ground: false, lowerFl: 100, upperFl: FL_MAX, squawk: 'all' },
    },
    fleet: FLEET,
    steps: [{ name: 'traffic/filtered', act: togglePanels }],
  },
  {
    settings: NEAR_NORMAL,
    fleet: FLEET,
    steps: [
      detail('detail/climb', 'TEST01'),
      detail('detail/descent', 'TEST08'),
      detail('detail/extreme', 'TEST09'),
      detail('detail/advisory', 'TEST05'),
      detail('detail/estimate', 'TEST07'),
      detail('detail/lost', 'TEST14'),
      detail('detail/tape-edge', 'TEST02'),
      detail('detail/carrying', 'TEST04'),
    ],
  },
  {
    settings: NEAR_NORMAL,
    fleet: [DRIFTING],
    steps: [detail('detail/drifting', 'TEST15')],
  },
  {
    settings: NEAR_NORMAL,
    fleet: FLEET,
    plotted: ['pfd', 'nd', 'surv'],
    steps: [detail('detail/sparse', 'TEST-12'), detail('detail/surv', 'TEST01')],
  },
  {
    settings: NEAR_NORMAL,
    fleet: FLEET,
    plotted: ['alt', 'vs', 'gs', 'trk', 'roll', 'qnh', 'modes', 'wind'],
    steps: [
      detail('lanes/flight', 'TEST01'),
      detail('lanes/ground', 'TEST11'),
      detail('lanes/glyphs', 'TEST10'),
    ],
  },
  {
    settings: NEAR_NORMAL,
    fleet: FLEET,
    plotted: ['ias', 'tas', 'mach', 'oat', 'tat', 'nic', 'nacp'],
    steps: [detail('lanes/air', 'TEST01')],
  },
  {
    settings: NEAR_NORMAL,
    fleet: FLEET,
    plotted: ['src', 'rssi', 'msgs', 'age'],
    steps: [detail('lanes/reception', 'TEST13')],
  },
];
