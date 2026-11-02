/**
 * Times the pure chart builders on the synthetic national-scale set, with no browser and no GPU:
 * each step several times after a warm-up, reported by its median and longest run.
 *
 *   mise run bench:map [--scale 1] [--site lat,lon] [--json out.json]
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { loadDeclination } from '../../src/lib/wmm';
import { resolveSite } from '../map/site';
import { chartSteps, timeOf } from './chartSteps';
import { syntheticMapSet } from './synthetic';

const RJTT = '35.5533,139.7811';
const RUNS = { warmups: 3, runs: 9 };

const { values: opt } = parseArgs({
  options: {
    scale: { type: 'string', default: '1' },
    site: { type: 'string', default: RJTT },
    json: { type: 'string' },
  },
});

const site = resolveSite(opt.site.split(','), {});
const { data } = syntheticMapSet({ site, scale: Number(opt.scale) });
const times = chartSteps(data, site, await loadDeclination()).map((step) => {
  const { medianMs, maxMs } = timeOf(step, RUNS);
  return { name: step.name, medianMs, maxMs };
});

const ms = (n: number) => n.toFixed(1).padStart(7);
const width = Math.max(...times.map((t) => t.name.length));
console.log(data.title);
console.log(`${'step'.padEnd(width)}  median      max`);
for (const { name, medianMs, maxMs } of times) {
  console.log(`${name.padEnd(width)}  ${ms(medianMs)}  ${ms(maxMs)}`);
}
if (opt.json) writeFileSync(opt.json, JSON.stringify(times, null, 2));
