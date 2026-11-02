/**
 * What the visual tests shoot. A visit is one page load, the costly part, so as many images as can
 * share a state of the page come from one: steps taken in turn, or crops of a single screenshot.
 */
import type { Locator, Page } from 'playwright';

import { DRAW_STACK, LAYER_GROUPS } from '../../src/lib/layers';
import { FL_MAX } from '../../src/state/filter';
import type { Chart } from '../headless/browser';
import { cellOf, onScope, type Place, type Sheet } from './grid';
import type { Clip } from './imageDiff';
import { SPECIMEN_TITLE, specimenSheet } from './specimens';
import { DRIFTING, FLEET, type Flight, LONE, LONE_FLIGHTS, placeOf } from './traffic';

/** XQPA, the example set's aerodrome. */
export const SITE = { lat: 33.5859, lon: 130.4508 };
const EXAMPLE_SET = 'schema/example.mapset.geojson';
const EXAMPLE_TITLE = 'Example map set (fictional)';
const NEAR_NM = 40;
const WIDE_NM = 200;

/** The parts of a screenshot, each with an image of its own. */
export interface Crop {
  name: string;
  clip: Clip;
}

export interface Step {
  /** Puts the page in the state to shoot, from where the last step left it. */
  act?: (page: Page) => Promise<void>;
  /** The image of the whole page or of `of`; `crops` in place of it for several. */
  name?: string;
  of?: (page: Page) => Locator;
  crops?: readonly Crop[];
}

export interface Visit {
  settings: Record<string, unknown>;
  /** What the page imports before its steps. */
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

/** Shows only the flights, on a vector short enough to stay in a cell of a sheet. */
const ALONE = { ...NEAR_NORMAL, vectorMin: 1, shownLayers: { rings: false } };
const AROUND_SITE = { x: 620, y: 380, width: 360, height: 240 };
/** From a target to the middle of its block, north-east of it. */
const BLOCK = { dx: 50, dy: -35 };
const BLOCK_CELLS: Sheet = { cols: 6, width: 250, height: 130 };

/** Each lone flight in a cell of its own, with an address and a callsign of its own. */
const BLOCKS = Object.entries(LONE_FLIGHTS).map(([name, flight], i) => {
  const { place, clip } = cellOf(i, BLOCK_CELLS);
  const hex = `d2${(i + 16).toString(16).padStart(4, '0')}`;
  const callsign = flight.id.flight && { flight: `TEST${20 + i}` };
  return { name, flight: { ...flight, at: place, id: { ...flight.id, ...callsign, hex } }, clip };
});

const blockNamed = (name: string) => {
  const block = BLOCKS.find((b) => b.name === name);
  if (!block) throw new Error(`no block ${name}`);
  return block.flight;
};

/** Takes the block of the flight at `at` and moves it by `dx` and `dy`, still held. */
async function dragBlock(page: Page, at: Place, dx: number, dy: number): Promise<void> {
  const [x, y] = onScope(at);
  await page.mouse.move(x + BLOCK.dx, y + BLOCK.dy);
  await page.mouse.down();
  await page.mouse.move(x + BLOCK.dx + dx, y + BLOCK.dy + dy, { steps: 4 });
}

const heldBlock = (name: string, dx: number, dy: number): Visit => ({
  settings: ALONE,
  fleet: [LONE],
  steps: [
    {
      act: async (page) => {
        await togglePanels(page);
        await dragBlock(page, LONE.at, dx, dy);
      },
      crops: [{ name: `block/${name}`, clip: AROUND_SITE }],
    },
  ],
});

const { set: specimens, crops: elementCrops } = specimenSheet(EXAMPLE_SET, SITE);

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
    settings: { rangeNm: NEAR_NM, labelDensity: 'off', shownLayers: EVERY_LAYER },
    chart: EXAMPLE,
    steps: [{ name: 'map/density-off', act: togglePanels }],
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
    settings: { rangeNm: NEAR_NM, openGroups: GROUPS, shownLayers: EVERY_LAYER },
    chart: EXAMPLE,
    steps: [{ name: 'tree/every-layer', of: mapsPanel }],
  },
  {
    settings: {
      rangeNm: NEAR_NM,
      labelDensity: 'dense',
      shownLayers: { ...EVERY_LAYER, rings: false },
    },
    chart: {
      title: SPECIMEN_TITLE,
      file: {
        name: 'specimens.mapset.geojson',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(specimens)),
      },
    },
    steps: [{ act: togglePanels, crops: elementCrops }],
  },
  {
    settings: {
      ...ALONE,
      filter: { ground: true, lowerFl: 50, upperFl: FL_MAX, squawk: 'all' },
    },
    fleet: BLOCKS.map(({ flight }) => flight),
    steps: [
      {
        act: async (page) => {
          await select(blockNamed('selected').id.flight ?? '')(page);
          await togglePanels(page);
          await dragBlock(page, blockNamed('dropped').at, -120, 30);
          await page.mouse.up();
          await page.mouse.move(...onScope(blockNamed('hovered').at));
        },
        crops: BLOCKS.map(({ name, clip }) => ({ name: `block/${name}`, clip })),
      },
    ],
  },
  heldBlock('dragged', 40, -25),
  heldBlock('straddling', -30, -10),
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
