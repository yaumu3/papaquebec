/**
 * Open the built scope in headless Chromium with WebGPU and save a screenshot plus the console
 * log. Expects a server on `--url`, or starts `vite preview` itself with `--preview`. `--sim`
 * instead starts a server that flies the synthetic fleet at that speed and serves the build.
 *
 *   bun scripts/screenshot.ts --out shot.png [--url http://localhost:4173/] [--preview]
 *     [--sim 10] [--extra 300] [--scenario parallel] [--range 10] [--site lat,lon]
 *     [--wait 6000] [--select TEST02] [--hint] [--scale 2]
 *
 * `--extra` adds that many generic targets to the sim's fleet, and `--scenario` flies one of
 * the scenarios (merge, parallel, cross, converging, random) in its place. `--range` sets the range shown,
 * NM. `--hint` opens the keyboard and mouse hint pane, as the `?` key does.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { openScope } from './browser';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    out: { type: 'string', default: 'shot.png' },
    preview: { type: 'boolean', default: false },
    sim: { type: 'string' },
    extra: { type: 'string', default: '0' },
    scenario: { type: 'string' },
    range: { type: 'string' },
    site: { type: 'string', default: '35.5533,139.7811' }, // RJTT
    wait: { type: 'string', default: '6000' },
    select: { type: 'string' },
    hint: { type: 'boolean', default: false },
    scale: { type: 'string', default: '2' },
  },
});

const { page, log, close } = await openScope({
  from:
    opt.sim === undefined
      ? { url: opt.url, preview: opt.preview }
      : {
          sim: {
            speed: Number(opt.sim),
            extra: Number(opt.extra),
            site: opt.site,
            scenario: opt.scenario,
          },
        },
  scale: Number(opt.scale),
  settings: opt.range === undefined ? undefined : { rangeNm: Number(opt.range) },
});
await page.waitForTimeout(Number(opt.wait));
if (opt.select) {
  await page.getByText(opt.select, { exact: true }).first().click();
  await page.waitForTimeout(1500);
}
if (opt.hint) {
  await page.keyboard.press('?');
  await page.waitForTimeout(500);
}
const status = await page.evaluate(() => document.querySelector('#top-bar')?.textContent ?? '');
await page.screenshot({ path: opt.out });
await close();
writeFileSync(`${opt.out}.log`, log.join('\n'));
console.log(`top bar: ${status}`);
console.log(log.join('\n'));
