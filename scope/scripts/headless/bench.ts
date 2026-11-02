/**
 * Load test: the built scope in headless Chromium, fed by a server flying the sim with extra
 * traffic, driven through idle, pan, zoom and hover. Reports main-thread frame intervals and long
 * tasks, the messages posted to the render worker (one `slot:<name>` per slot rebuild) with their
 * bytes, and the sampled time in each function named in `--fn`, callees included. A name in
 * `--fn` must be that of one function declared in the build, which keeps names only in the
 * unminified build `bun run bench` makes.
 *
 *   bun run bench [--extra 300] [--seconds 3] [--warmup 6000] [--fn a,b] [--json out.json]
 *     [--site lat,lon] [--map none|example|synthetic[=N]|<file>] [--layers default|all]
 *     [--density normal] [--scenarios a,b]
 *
 * `--map` imports a map set through the Maps panel as the first scenario, `import`; `synthetic` is
 * the national-scale set of `synthetic.ts`, N times over. The map scenarios then run after the
 * others, with a time to frame for each action: `toggle`, `settle`, `range`, `search`, `point`.
 * The time runs from the input to the first draw after the action's last post to a chart, label,
 * trace or highlight slot. `settle` is timed from the settle delay firing; `range` crosses the
 * navaid threshold, and its time holds that delay, since its labels wait for it too.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type { CDPSession, Page } from 'playwright';

import { ZOOM_SETTLE_MS } from '../../src/canvas/settle';
import { LABEL_DENSITIES } from '../../src/lib/layers';
import { resolveSite } from '../map/site';
import { ACTION_SLOTS } from './actions';
import { openScope } from './browser';
import { bundleIn, fnProblems } from './fnCheck';
import { benchSettings, loadMap, parseMapOption } from './mapOption';
import { inclusiveMs } from './profile';
import { installRecorder } from './recorder';
import { rowsOf, summarize } from './report';
import {
  chosenScenarios,
  importScenario,
  inSequence,
  loadScenarios,
  mapScenarios,
} from './scenarios';

const { values: opt } = parseArgs({
  options: {
    extra: { type: 'string', default: '300' },
    site: { type: 'string', default: '35.5533,139.7811' }, // RJTT
    seconds: { type: 'string', default: '3' },
    warmup: { type: 'string', default: '6000' },
    fn: {
      type: 'string',
      default:
        'buildRings,buildCoast,validateMapSet,chartOf,topologyOf,treeItemsOf,searchTree,drawnItemsOf,' +
        'drawnPointsOf,areaPlaceOf,buildShapes,buildAreaLabels,buildRouteLabels,buildPointLabels,' +
        'buildTraces,buildHighlight,blockSubjects,buildTargets,buildHover,buildOverlays',
    },
    map: { type: 'string', default: 'none' },
    layers: { type: 'string', default: 'default' },
    density: { type: 'string', default: 'normal' },
    scenarios: { type: 'string' },
    json: { type: 'string' },
  },
});

/** One of `choices`, which `--flag` must name. */
function oneOf<T extends string>(flag: string, text: string, choices: readonly T[]): T {
  const choice = choices.find((c) => c === text);
  if (!choice) throw new Error(`${flag} takes ${choices.join(', ')}, not ${text}`);
  return choice;
}

const layers = oneOf('--layers', opt.layers, ['default', 'all'] as const);
const density = oneOf('--density', opt.density, LABEL_DENSITIES);
const map = loadMap(parseMapOption(opt.map), resolveSite(opt.site.split(','), {}));
const scenarios = chosenScenarios(
  {
    ...(map ? { import: importScenario(map.chart) } : {}),
    ...loadScenarios(Number(opt.seconds)),
    ...(map ? mapScenarios(map.searched) : {}),
  },
  opt.scenarios,
);
const traced = opt.fn.split(',').filter(Boolean);
const problems = fnProblems(traced, bundleIn('dist'));
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

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

const { page, log, close } = await openScope({
  from: { sim: { speed: 1, extra: Number(opt.extra), site: opt.site } },
  scale: 2,
  settings: benchSettings({ map: map !== null, layers, density }),
});
try {
  await page.waitForTimeout(Number(opt.warmup));
  await page.evaluate(installRecorder, { settleMs: ZOOM_SETTLE_MS, actionSlots: ACTION_SLOTS });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  const results = await inSequence(scenarios, async ([name, ready]) => {
    const run = await ready(page);
    const [sample, ms] = await profiled(cdp, page, async () => {
      await page.evaluate(() => window.benchRecorder.start());
      await run();
      return page.evaluate(() => window.benchRecorder.stop());
    });
    return summarize(name, sample, ms);
  });
  const status = await page.evaluate(() => document.querySelector('#top-bar')?.textContent ?? '');
  console.log(status);
  if (map) console.log(`map    ${JSON.stringify(map.size)}`);
  console.log(results.flatMap(rowsOf).join('\n'));
  if (opt.json) {
    const report = map ? { map: map.size, scenarios: results } : results;
    writeFileSync(opt.json, JSON.stringify(report, null, 2));
  }
  const errors = log.filter((l) => l.includes('error'));
  if (errors.length) console.log(errors.join('\n'));
} finally {
  await close();
}
