/**
 * Screenshots against the baselines in `visual/`, a folder for each subject: the built scope with
 * no feed, no built-in set and no coastline, showing a map set imported through the Maps panel.
 * `shots.ts` lists them. On a difference the actual image and a diff are written next to the
 * baseline.
 *
 *   bun scripts/visual/main.ts [--update] [--only name-or-folder]...
 *
 * Runs in the pinned container: use `mise run check:visual`, or `bun run visual --update` to
 * rewrite the baselines.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import type { Browser, Page } from 'playwright';
import { PNG } from 'pngjs';

import { launch, openScope, startPreview } from '../headless/browser';
import { compareImages, type Image, type Limits } from './imageDiff';
import { filterOf, settled } from './run';
import { SITE, type Step, type Visit, VISITS } from './shots';

/** The example set's date: the scope's clock stands still at it. */
const CLOCK = new Date('2026-10-29T00:00:00Z');
const SERVED = '/tmp/visual-dist';
const URL_SERVED = 'http://localhost:4173/';
/** Tight enough to fail a label moved 1 px, a removed halo or a wider chevron. */
const LIMITS: Limits = { channel: 24, share: 0.00002 };
const SETTLE_MS = 300;
const SETTLE_TRIES = 100;
/** The pages open at once. */
const VISITS_AT_ONCE = 4;
/** The feed's status and the clock depend on when the shot is taken. */
const UNSTABLE = '#top-bar { visibility: hidden }';
/** A panel lets the canvas show through, which draws in its own time: the panel's image leaves it out. */
const NO_CANVAS = 'canvas { visibility: hidden }';

interface Taken {
  name: string;
  png: Buffer;
}

/** Throws when the scope says it cannot draw: such a page must not pass, or become a baseline. */
async function drawing(page: Page): Promise<void> {
  const failed = page.getByText('NO SCOPE');
  if ((await failed.count()) > 0) throw new Error(await failed.innerText());
}

const imageOf = (png: Buffer): Image => PNG.sync.read(png);

const pngOf = (image: Image): Buffer =>
  PNG.sync.write(Object.assign(new PNG(image), { data: image.data }));

/** Takes the images of a step, once the page has settled in its state. */
async function taken(page: Page, step: Step): Promise<Taken[]> {
  await step.act?.(page);
  const target = step.of?.(page) ?? page;
  const look = {
    animations: 'disabled',
    style: step.of ? `${UNSTABLE} ${NO_CANVAS}` : UNSTABLE,
  } as const;
  const shoot = () => target.screenshot(look);
  const png = await settled(shoot, { pause: () => Bun.sleep(SETTLE_MS), tries: SETTLE_TRIES });
  await drawing(page);
  return [{ name: step.name, png }];
}

/** Imports the visit's chart through the Maps panel. */
async function readied(page: Page, visit: Visit): Promise<void> {
  await page.locator('input[type=file]').setInputFiles(visit.chart.file);
  await page.getByRole('button', { name: visit.chart.title, exact: true }).waitFor();
}

async function capture(visit: Visit, browser: Browser): Promise<Taken[]> {
  const { page, close } = await openScope({
    browser,
    from: { url: `${URL_SERVED}?site=${SITE.lat},${SITE.lon}`, preview: false },
    scale: 1,
    settings: visit.settings,
    prepare: (context) => context.clock.setFixedTime(CLOCK),
  });
  try {
    await readied(page, visit);
    return await visit.steps.reduce<Promise<Taken[]>>(
      async (images, step) => [...(await images), ...(await taken(page, step))],
      Promise.resolve([]),
    );
  } finally {
    await close();
  }
}

/** Compares an image with its baseline; says what differs, or nothing. */
function checked({ name, png }: Taken): string | null {
  const baselinePath = `visual/${name}.png`;
  const actualPath = `visual/${name}.actual.png`;
  const diffPath = `visual/${name}.diff.png`;
  mkdirSync(dirname(baselinePath), { recursive: true });
  rmSync(actualPath, { force: true });
  rmSync(diffPath, { force: true });
  if (!existsSync(baselinePath)) {
    writeFileSync(actualPath, png);
    return `${name}: no baseline`;
  }
  const baseline = imageOf(readFileSync(baselinePath));
  const { passed, differing, share, diff } = compareImages(baseline, imageOf(png), LIMITS);
  if (passed) return null;
  writeFileSync(actualPath, png);
  writeFileSync(diffPath, pngOf(diff));
  return `${name}: ${differing} pixels differ, ${(share * 100).toFixed(4)}%`;
}

function updated({ name, png }: Taken): null {
  mkdirSync(dirname(`visual/${name}.png`), { recursive: true });
  writeFileSync(`visual/${name}.png`, png);
  return null;
}

/** The build with nothing in `map/`, whatever the machine's `public/map` holds. */
function servedCopy(): void {
  rmSync(SERVED, { recursive: true, force: true });
  cpSync('dist', SERVED, { recursive: true });
  rmSync(`${SERVED}/map`, { recursive: true, force: true });
}

const { values: opt } = parseArgs({
  options: {
    update: { type: 'boolean', default: false },
    only: { type: 'string', multiple: true },
  },
});

const namesOf = ({ steps }: Visit) => steps.map((step) => step.name);
const chosen = filterOf(opt.only);
const visits = VISITS.filter((visit) => namesOf(visit).some(chosen));

/** Says why a page gave no images, so that the rest of the run still reports. */
const failedPage = (visit: Visit, error: unknown) =>
  `${namesOf(visit).join(', ')}: ${error instanceof Error ? error.message : String(error)}`;

/** Takes the images of each visit, a few at a time; what failed. */
async function run(browser: Browser): Promise<string[]> {
  const waiting = [...visits];
  const failures: string[] = [];
  let compared = 0;
  const work = async (): Promise<void> => {
    const visit = waiting.shift();
    if (!visit) return;
    const images = await capture(visit, browser).catch((error: unknown) => {
      failures.push(failedPage(visit, error));
      return [];
    });
    const wanted = images.filter(({ name }) => chosen(name));
    compared += wanted.length;
    failures.push(...wanted.flatMap((i) => (opt.update ? updated(i) : checked(i)) ?? []));
    await work();
  };
  await Promise.all(Array.from({ length: VISITS_AT_ONCE }, work));
  console.log(`${compared} images from ${visits.length} pages`);
  return failures;
}

servedCopy();
const preview = await startPreview(URL_SERVED, SERVED);
const browser = await launch();
const failures = await run(browser).finally(async () => {
  await browser.close();
  preview.stop();
});
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
