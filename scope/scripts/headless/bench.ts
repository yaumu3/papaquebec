/**
 * Load test: the built scope in headless Chromium, fed by a server flying the sim with extra
 * traffic, driven through idle, pan, zoom and hover. Reports main-thread frame intervals and long tasks, the
 * messages posted to the render worker (one `slot:<name>` per slot rebuild) with their bytes,
 * and the sampled time in each function named in `--fn`, callees included. Function names need
 * the unminified build `bun run bench` makes.
 *
 *   bun run bench [--extra 300] [--seconds 3] [--warmup 6000] [--fn a,b] [--json out.json]
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type { CDPSession, Page } from 'playwright';

import { openScope } from './browser';
import { inclusiveMs } from './profile';
import { installRecorder } from './recorder';
import { rowsOf, summarize } from './report';
import { loadScenarios } from './scenarios';

const { values: opt } = parseArgs({
  options: {
    extra: { type: 'string', default: '300' },
    site: { type: 'string', default: '35.5533,139.7811' }, // RJTT
    seconds: { type: 'string', default: '3' },
    warmup: { type: 'string', default: '6000' },
    fn: {
      type: 'string',
      default:
        'buildRings,buildCoast,buildChart,blockSubjects,buildTargets,buildHover,buildOverlays,setSlot',
    },
    json: { type: 'string' },
  },
});

const traced = opt.fn.split(',').filter(Boolean);

/**
 * Runs `work` under the CPU profiler and reports what it gave with the time in each traced
 * function. Starting the profiler stalls the page for a few frames, so `work` waits until the
 * page has drawn past it.
 */
async function profiled<T>(
  cdp: CDPSession,
  page: Page,
  work: () => Promise<T>,
): Promise<[T, Map<string, number>]> {
  await cdp.send('Profiler.start');
  await page.evaluate(
    () => new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn))),
  );
  const done = await work();
  const { profile } = await cdp.send('Profiler.stop');
  return [done, inclusiveMs(profile, traced)];
}

/** `fn` over `items`, one after another. */
function inSequence<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  return items.reduce<Promise<R[]>>(
    async (done, item) => [...(await done), await fn(item)],
    Promise.resolve([]),
  );
}

const { page, log, close } = await openScope({
  from: { sim: { speed: 1, extra: Number(opt.extra), site: opt.site } },
  scale: 2,
});
try {
  await page.waitForTimeout(Number(opt.warmup));
  await page.evaluate(installRecorder);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  const results = await inSequence(
    Object.entries(loadScenarios(Number(opt.seconds))),
    async ([name, ready]) => {
      const run = await ready(page);
      const [sample, ms] = await profiled(cdp, page, async () => {
        await page.evaluate(() => window.benchRecorder.start());
        await run();
        return page.evaluate(() => window.benchRecorder.stop());
      });
      return summarize(name, sample, ms);
    },
  );
  const status = await page.evaluate(() => document.querySelector('#top-bar')?.textContent ?? '');
  console.log(status);
  console.log(results.flatMap(rowsOf).join('\n'));
  if (opt.json) writeFileSync(opt.json, JSON.stringify(results, null, 2));
  const errors = log.filter((l) => l.includes('error'));
  if (errors.length) console.log(errors.join('\n'));
} finally {
  await close();
}
