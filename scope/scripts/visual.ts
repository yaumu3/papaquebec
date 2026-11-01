/**
 * Screenshots of the map against the baselines in `visual/`, each from a fresh browser: the built
 * scope with no feed, no built-in set and no coastline, the example set imported through the Maps
 * panel. On a difference the actual image and a diff are written next to the baseline.
 *
 *   bun scripts/visual.ts [--update]
 *
 * Runs in the pinned container: use `mise run check:visual`, or `bun run visual --update` to
 * rewrite the baselines.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type { Locator, Page } from 'playwright';
import { PNG } from 'pngjs';

import { openScope, startPreview } from './browser';
import { compareImages, type Image, type Limits } from './imageDiff';

/** XQPA, the example set's aerodrome. */
const SITE = '33.5859,130.4508';
const NEAR_NM = 40;
const WIDE_NM = 200;
/** The example set's date: the scope's clock stands still at it. */
const CLOCK = new Date('2026-10-29T00:00:00Z');
const EXAMPLE_SET = 'schema/example.mapset.geojson';
const SERVED = '/tmp/visual-dist';
const URL_SERVED = 'http://localhost:4173/';
/** Tight enough to fail a label moved 1 px, a removed halo or a wider chevron. */
const LIMITS: Limits = { channel: 16, share: 0.00002 };
const SETTLE_MS = 300;
const SETTLE_TRIES = 100;
/** The feed's status and the clock depend on when the shot is taken. */
const UNSTABLE = '#top-bar { visibility: hidden }';

const EVERY_LAYER = {
  ad: true,
  navaid: true,
  fix: true,
  vfr: true,
  sid: true,
  star: true,
  trans: true,
  conv: true,
  rnav: true,
  dct: true,
  hold: true,
  ctr: true,
  pr: true,
  tma: true,
  sector: true,
  fir: true,
  dng: true,
  tra: true,
  adiz: true,
  cta: true,
  advisory: true,
  civt: true,
  asr: true,
  coast: true,
  rings: true,
};

const GROUPS = ['POINTS', 'ROUTES', 'PROCEDURES', 'RESTRICTIONS', 'AIRSPACE', 'BASE MAP'];

interface Shot {
  name: string;
  settings: Record<string, unknown>;
  /** Puts the scope in the state to shoot, after the import. The panels stay open when given. */
  act?: (page: Page) => Promise<void>;
  /** What to shoot, if not the whole page. */
  of?: (page: Page) => Locator;
}

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

const NEAR_NORMAL = { rangeNm: NEAR_NM, labelDensity: 'normal' };

const SHOTS: readonly Shot[] = [
  { name: 'default', settings: NEAR_NORMAL },
  {
    name: 'every-layer',
    settings: { rangeNm: NEAR_NM, labelDensity: 'dense', shownLayers: EVERY_LAYER },
  },
  {
    name: 'wide',
    settings: { rangeNm: WIDE_NM, labelDensity: 'dense', shownLayers: EVERY_LAYER },
  },
  {
    name: 'search',
    settings: NEAR_NORMAL,
    act: pointAt('Q', 'QDG'),
  },
  {
    name: 'pointed-airway',
    settings: NEAR_NORMAL,
    act: pointAt('V901', 'V901'),
  },
  {
    name: 'pointed-procedure',
    settings: NEAR_NORMAL,
    act: pointAt('TAVRO2', 'TAVRO2'),
  },
  {
    name: 'pointed-area',
    settings: NEAR_NORMAL,
    act: pointAt('PAPAQ', 'PAPAQ', 1),
  },
  {
    name: 'pointed-hold',
    settings: NEAR_NORMAL,
    act: pointAt('NIMBA', 'NIMBA', 1),
  },
  {
    name: 'tree-search',
    settings: { rangeNm: NEAR_NM, openGroups: ['ROUTES'], openLayers: ['conv'] },
    act: (page) => search(page, 'A9'),
    of: mapsPanel,
  },
  {
    name: 'tree-swatches',
    settings: { rangeNm: NEAR_NM, openGroups: GROUPS, openLayers: ['navaid'] },
    act: async () => {},
    of: mapsPanel,
  },
];

/** One click at a time: the top bar ignores clicks made together. */
const closePanels = (page: Page) =>
  ['DISP', 'MAP', 'LIST', 'DETAIL'].reduce(
    (done, name) => done.then(() => page.getByRole('button', { name, exact: true }).click()),
    Promise.resolve(),
  );

/** A shot once two in a row match: a frame may still be on its way to the canvas. */
async function settled(
  shoot: () => Promise<Buffer>,
  last: Buffer,
  tries = SETTLE_TRIES,
): Promise<Buffer> {
  if (tries === 0) throw new Error('the scope did not settle');
  await Bun.sleep(SETTLE_MS);
  const next = await shoot();
  return next.equals(last) ? next : settled(shoot, next, tries - 1);
}

/** Throws when the scope says it cannot draw: such a page must not pass, or become a baseline. */
async function drawing(page: Page): Promise<void> {
  const failed = page.getByText('NO SCOPE');
  if ((await failed.count()) > 0) throw new Error(await failed.innerText());
}

async function capture(shot: Shot): Promise<Buffer> {
  const { page, close } = await openScope({
    from: { url: `${URL_SERVED}?site=${SITE}`, preview: false },
    scale: 1,
    settings: shot.settings,
    prepare: (context) => context.clock.setFixedTime(CLOCK),
  });
  try {
    await page.locator('input[type=file]').setInputFiles(EXAMPLE_SET);
    await page.getByRole('button', { name: 'Example map set (fictional)', exact: true }).waitFor();
    if (shot.act) await shot.act(page);
    else await closePanels(page);
    const target = shot.of?.(page) ?? page;
    const shoot = () => target.screenshot({ animations: 'disabled', style: UNSTABLE });
    const image = await settled(shoot, await shoot());
    await drawing(page);
    return image;
  } finally {
    await close();
  }
}

const imageOf = (png: Buffer): Image => PNG.sync.read(png);

/** Compares a shot with its baseline; says what differs, or nothing. */
function checked(name: string, actual: Buffer): string | null {
  const baselinePath = `visual/${name}.png`;
  const actualPath = `visual/${name}.actual.png`;
  const diffPath = `visual/${name}.diff.png`;
  rmSync(actualPath, { force: true });
  rmSync(diffPath, { force: true });
  if (!existsSync(baselinePath)) {
    writeFileSync(actualPath, actual);
    return `${name}: no baseline`;
  }
  const baseline = imageOf(readFileSync(baselinePath));
  const { passed, differing, share, diff } = compareImages(baseline, imageOf(actual), LIMITS);
  const counted = `${name}: ${differing} pixels differ, ${(share * 100).toFixed(4)}%`;
  console.log(counted);
  if (passed) return null;
  writeFileSync(actualPath, actual);
  writeFileSync(diffPath, PNG.sync.write(Object.assign(new PNG(diff), { data: diff.data })));
  return counted;
}

/** The build with nothing in `map/`, whatever the machine's `public/map` holds. */
function servedCopy(): void {
  rmSync(SERVED, { recursive: true, force: true });
  cpSync('dist', SERVED, { recursive: true });
  rmSync(`${SERVED}/map`, { recursive: true, force: true });
}

const { values: opt } = parseArgs({ options: { update: { type: 'boolean', default: false } } });

servedCopy();
const preview = await startPreview(URL_SERVED, SERVED);
/** Takes the shots one after another, each with the machine to itself; what failed, in order. */
async function run(shots: readonly Shot[]): Promise<string[]> {
  const [shot, ...rest] = shots;
  if (!shot) return [];
  const actual = await capture(shot);
  if (opt.update) writeFileSync(`visual/${shot.name}.png`, actual);
  const failure = opt.update ? null : checked(shot.name, actual);
  return [...(failure ? [failure] : []), ...(await run(rest))];
}

const failures = await run(SHOTS).finally(preview.stop);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
