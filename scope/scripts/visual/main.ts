/**
 * Screenshots against the baselines in `visual/`, a folder for each subject: the built scope with
 * no built-in set and no coastline, showing a map set imported through the Maps panel with no
 * feed, or a fleet with no chart. `shots.ts` lists them. On a difference the actual image
 * and a diff are written next to the baseline.
 *
 *   bun scripts/visual/main.ts [--update] [--only name-or-folder]...
 *
 * Runs in the pinned container: use `mise run check:visual`, or `bun run visual --update` to
 * rewrite the baselines.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import type { Browser, BrowserContext, Page, Route } from 'playwright';
import { PNG } from 'pngjs';

import { launch, openScope, startPreview } from '../headless/browser';
import { compareImages, cropImage, type Image, type Limits } from './imageDiff';
import { filterOf, settled } from './run';
import { SITE, type Step, type Visit, VISITS } from './shots';
import { fixedPlacer, type Flight, listedAs, replayWorker, trafficEvents } from './traffic';

/** The example set's date: the scope's clock stands still at it. */
const CLOCK = new Date('2026-10-29T00:00:00Z');
const FEED_WORKER = '**/assets/feedWorker-*.js';
const PLACER_WORKER = '**/assets/placerWorker-*.js';
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

const workerOf = (body: string) => (route: Route) =>
  route.fulfill({ contentType: 'text/javascript', body });

/** The replay of each fleet: a long one takes as long to write out as a page does to load. */
const replays = new Map<readonly Flight[], string>();

function replayOf(fleet: readonly Flight[]): string {
  const replay = replays.get(fleet) ?? replayWorker(trafficEvents(fleet, SITE, CLOCK));
  replays.set(fleet, replay);
  return replay;
}

/** Stands in for the feed worker and the placer's: the build flies `fleet`, its blocks fixed. */
async function fly(context: BrowserContext, fleet: readonly Flight[]): Promise<void> {
  await context.route(FEED_WORKER, workerOf(replayOf(fleet)));
  await context.route(PLACER_WORKER, workerOf(fixedPlacer(fleet)));
}

const imageOf = (png: Buffer): Image => PNG.sync.read(png);

const pngOf = (image: Image): Buffer =>
  PNG.sync.write(Object.assign(new PNG(image), { data: image.data }));

/** Takes the images of a step, once the page has settled in its state. */
async function taken(page: Page, step: Step, style: string): Promise<Taken[]> {
  await step.act?.(page);
  const target = step.of?.(page) ?? page;
  const look = {
    animations: 'disabled',
    style: step.of ? `${style} ${NO_CANVAS}` : style,
  } as const;
  const shoot = () => target.screenshot(look);
  const png = await settled(shoot, { pause: () => Bun.sleep(SETTLE_MS), tries: SETTLE_TRIES });
  await drawing(page);
  if (step.name) return [{ name: step.name, png }];
  const whole = imageOf(png);
  return (step.crops ?? []).map(({ name, clip }) => ({
    name,
    png: pngOf(cropImage(whole, clip)),
  }));
}

/** Waits for what the page starts from: the fleet in the list, or the chart in the Maps panel. */
async function readied(page: Page, visit: Visit): Promise<void> {
  const [first] = visit.fleet ?? [];
  if (first) await page.getByText(listedAs(first), { exact: true }).first().waitFor();
  if (!visit.chart) return;
  await page.locator('input[type=file]').setInputFiles(visit.chart.file);
  await page.getByRole('button', { name: visit.chart.title, exact: true }).waitFor();
}

async function capture(visit: Visit, browser: Browser): Promise<Taken[]> {
  const { page, close } = await openScope({
    browser,
    from: { url: `${URL_SERVED}?site=${SITE.lat},${SITE.lon}`, preview: false },
    scale: 1,
    settings: visit.settings,
    plotted: visit.plotted,
    prepare: async (context) => {
      await context.clock.setFixedTime(CLOCK);
      if (visit.fleet) await fly(context, visit.fleet);
    },
  });
  try {
    await readied(page, visit);
    const style = visit.fleet ? '' : UNSTABLE;
    return await visit.steps.reduce<Promise<Taken[]>>(
      async (images, step) => [...(await images), ...(await taken(page, step, style))],
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

const namesOf = ({ steps }: Visit) =>
  steps.flatMap((step) => (step.name ? [step.name] : (step.crops ?? []).map((c) => c.name)));
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
