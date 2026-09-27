/**
 * The built scope in headless Chromium with WebGPU, optionally fed by the sim. Chromium is
 * launched on Metal; change `--use-angle` below on other platforms.
 */
import { type Browser, chromium, type Page } from 'playwright';

import { simHandler } from './sim/server';

export interface ScopeBrowserOptions {
  url: string;
  /** Start `vite preview` on the URL's port instead of expecting a server there. */
  preview: boolean;
  /** Sim speed; the data paths are answered by the sim unless null. */
  sim: number | null;
  /** Generic targets the sim adds to its fleet. */
  extra: number;
  site: string;
  scale: number;
}

export interface ScopeBrowser {
  page: Page;
  /** Console output of the page and its workers, as it arrives. */
  log: string[];
  close: () => Promise<void>;
}

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

function launch(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,WebGPU',
      '--ignore-gpu-blocklist',
      '--use-angle=metal',
    ],
  });
}

export async function openScope(opt: ScopeBrowserOptions): Promise<ScopeBrowser> {
  const stopPreview = opt.preview ? await startPreview(opt.url) : () => {};
  const browser = await launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: opt.scale,
  });
  if (opt.sim !== null) {
    const [lat = 0, lon = 0] = opt.site.split(',').map(Number);
    const handle = simHandler({ site: { lat, lon }, speed: opt.sim, extra: opt.extra });
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
  return {
    page,
    log,
    close: async () => {
      await browser.close();
      stopPreview();
    },
  };
}
