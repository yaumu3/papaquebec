/**
 * The built scope in headless Chromium with WebGPU, optionally fed by a server flying the sim.
 * Chromium is launched on Metal; change `--use-angle` below on other platforms.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Browser, chromium, type Page } from 'playwright';

export interface ScopeBrowserOptions {
  url: string;
  /** Start `vite preview` on the URL's port instead of expecting a server there. */
  preview: boolean;
  /** Sim speed; a server flying the sim is started unless null. */
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

/** Apart from the dev server's, so both can run. */
const SIM_FEED_PORT = '4434';

interface SimServer {
  /** What the server published about how to reach its feed. */
  info: () => string;
  stop: () => void;
}

/** A server flying the sim, resolved once it has been built and listens. */
async function startSimServer(opt: ScopeBrowserOptions, speed: number): Promise<SimServer> {
  const directory = mkdtempSync(join(tmpdir(), 'pq-feed-'));
  const info = join(directory, 'info.json');
  const proc = Bun.spawn(['cargo', 'run', '--quiet'], {
    env: {
      ...process.env,
      PQ_SIM: opt.site,
      PQ_SIM_SPEED: String(speed),
      PQ_SIM_EXTRA: String(opt.extra),
      PQ_FEED_PORT: SIM_FEED_PORT,
      PQ_FEED_INFO: info,
    },
    stdout: 'ignore',
  });
  const stop = () => {
    proc.kill();
    rmSync(directory, { recursive: true, force: true });
  };
  /** Long enough for a first build of the server. */
  const published = async (tries: number): Promise<void> => {
    if (existsSync(info)) return;
    if (tries === 0 || proc.exitCode !== null) {
      stop();
      throw new Error('the server did not start');
    }
    await Bun.sleep(500);
    return published(tries - 1);
  };
  await published(600);
  return { info: () => readFileSync(info, 'utf8'), stop };
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
  const server = opt.sim === null ? null : await startSimServer(opt, opt.sim);
  if (server) {
    // The sim has no tar1090 behind it to keep traces.
    await context.route(/\/data\//, (route) => route.fulfill({ status: 404 }));
    await context.route(/\/feed\/info\.json$/, (route) =>
      route.fulfill({ status: 200, body: server.info(), contentType: 'application/json' }),
    );
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
      server?.stop();
      stopPreview();
    },
  };
}
