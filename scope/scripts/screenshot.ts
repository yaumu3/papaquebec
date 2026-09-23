/**
 * Open the built scope in headless Chromium with WebGPU and save a screenshot plus the console
 * log. Expects a server on `--url`, or starts `vite preview` itself with `--preview`. `--sim`
 * answers the data paths from the synthetic fleet at that speed instead of a receiver.
 *
 *   bun scripts/screenshot.ts --out shot.png [--url http://localhost:4173/] [--preview]
 *     [--sim 10] [--site lat,lon] [--wait 6000] [--select JAL317] [--scale 2]
 *
 * Chromium is launched on Metal; change `--use-angle` below on other platforms.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

import { simHandler } from './sim/server';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    out: { type: 'string', default: 'shot.png' },
    preview: { type: 'boolean', default: false },
    sim: { type: 'string' },
    site: { type: 'string', default: '35.5533,139.7811' }, // RJTT
    wait: { type: 'string', default: '6000' },
    select: { type: 'string' },
    scale: { type: 'string', default: '2' },
  },
});

const answers = (url: string) =>
  fetch(url).then(
    (r) => r.ok,
    () => false,
  );

async function untilUp(url: string, tries: number): Promise<void> {
  if (tries === 0 || (await answers(url))) return;
  await Bun.sleep(200);
  return untilUp(url, tries - 1);
}

/** `vite preview` on the URL's port, resolved once it answers. */
async function startPreview(url: string): Promise<() => void> {
  const port = new URL(url).port || '4173';
  const proc = Bun.spawn(['bunx', '--bun', 'vite', 'preview', '--port', port], {
    stdout: 'ignore',
  });
  await untilUp(url, 50);
  return () => proc.kill();
}

const stopPreview = opt.preview ? await startPreview(opt.url) : () => {};
const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,WebGPU',
    '--ignore-gpu-blocklist',
    '--use-angle=metal',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: Number(opt.scale),
});
if (opt.sim !== undefined) {
  const [lat = 0, lon = 0] = opt.site.split(',').map(Number);
  const handle = simHandler({ site: { lat, lon }, speed: Number(opt.sim) });
  await context.route(/\/(data|chunks)\//, async (route) => {
    const res = handle(new Request(route.request().url()));
    await route.fulfill({
      status: res.status,
      body: await res.text(),
      contentType: 'application/json',
    });
  });
}
const page = await context.newPage();
const log: string[] = [];
page.on('console', (m) => log.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
page.on('worker', (w) => {
  log.push(`[worker] ${w.url()}`);
  w.on('console', (m) => log.push(`[worker ${m.type()}] ${m.text()}`));
});
await page.goto(opt.url);
await page.waitForTimeout(Number(opt.wait));
if (opt.select) {
  await page.getByText(opt.select, { exact: true }).first().click();
  await page.waitForTimeout(1500);
}
const status = await page.evaluate(() => document.querySelector('#top-bar')?.textContent ?? '');
await page.screenshot({ path: opt.out });
await browser.close();
stopPreview();
writeFileSync(`${opt.out}.log`, log.join('\n'));
console.log(`top bar: ${status}`);
console.log(log.join('\n'));
