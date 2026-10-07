/**
 * The built scope in headless Chromium with WebGPU, optionally served by a server flying the sim.
 * Chromium is launched on Metal; change `--use-angle` below on other platforms.
 */
import { type Browser, chromium, type Page } from 'playwright';

/** The synthetic fleet a server started for the purpose flies, serving the build itself. */
export interface Sim {
  speed: number;
  /** Generic targets the sim adds to its fleet. */
  extra: number;
  site: string;
  /** A traffic scenario flown in place of the fleet: merge, parallel, cross, converging or random. */
  scenario?: string | undefined;
}

/** Where the page comes from: the sim, or a URL with `vite preview` started on its port if asked. */
export type Source = { sim: Sim } | { url: string; preview: boolean };

export interface ScopeBrowserOptions {
  from: Source;
  scale: number;
  /** Settings stored before the page loads, as if saved by an earlier visit; the rest default. */
  settings?: Record<string, unknown> | undefined;
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

/** Resolves once `url` answers; rejects once `running` says its server stopped, or after `tries`. */
export async function untilUp(
  url: string,
  tries: number,
  running: () => boolean = () => true,
): Promise<void> {
  if (await answers(url)) return;
  if (!running()) throw new Error(`the server for ${url} stopped`);
  if (tries <= 1) throw new Error(`${url} did not answer`);
  await Bun.sleep(200);
  return untilUp(url, tries - 1, running);
}

/** What `run` resolves to; when it fails instead, `stop` is called first. */
export async function stoppedOnFailure<T>(stop: () => void, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    stop();
    throw error;
  }
}

/** A process started, and whether it still runs. */
function spawned(command: string[], env: Record<string, string | undefined> = process.env) {
  const proc = Bun.spawn(command, { env, stdout: 'ignore' });
  return {
    running: () => proc.exitCode === null && proc.signalCode === null,
    stop: () => proc.kill(),
  };
}

/** A page being served, and how to stop serving it. */
interface Served {
  url: string;
  stop: () => void;
}

/** `vite preview` on the URL's port, resolved once it answers. */
async function startPreview(url: string): Promise<Served> {
  const port = new URL(url).port || '4173';
  const preview = spawned(['bunx', '--bun', 'vite', 'preview', '--port', port]);
  await stoppedOnFailure(preview.stop, () => untilUp(url, 50, preview.running));
  return { url, stop: preview.stop };
}

/** Apart from the dev server's, so both can run. */
const SIM_PORTS = { page: 8434, feed: 4434 };

/** A server flying the sim and serving the build, resolved once it answers. */
async function startSimServer(sim: Sim): Promise<Served> {
  const url = `http://localhost:${SIM_PORTS.page}/`;
  const server = spawned(['cargo', 'run', '--quiet'], {
    ...process.env,
    PQ_ADDRESS: `http://:${SIM_PORTS.page}`,
    PQ_FEED_PORT: String(SIM_PORTS.feed),
    PQ_SIM: sim.site,
    PQ_SIM_SPEED: String(sim.speed),
    PQ_SIM_EXTRA: String(sim.extra),
    ...(sim.scenario ? { PQ_SIM_SCENARIO: sim.scenario } : {}),
  });
  // Long enough for a first build of the server.
  await stoppedOnFailure(server.stop, () => untilUp(`${url}feed/info.json`, 1500, server.running));
  return { url, stop: server.stop };
}

function serve(from: Source): Promise<Served> {
  if ('sim' in from) return startSimServer(from.sim);
  if (from.preview) return startPreview(from.url);
  return Promise.resolve({ url: from.url, stop: () => {} });
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
  const served = await serve(opt.from);
  return stoppedOnFailure(served.stop, async () => {
    const browser = await launch();
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: opt.scale,
    });
    if (opt.settings) {
      await context.addInitScript((settings: Record<string, unknown>) => {
        localStorage.setItem('papaquebec.settings', JSON.stringify({ settings }));
      }, opt.settings);
    }
    const page = await context.newPage();
    const log: string[] = [];
    page.on('console', (m) => log.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
    page.on('worker', (w) => {
      log.push(`[worker] ${w.url()}`);
      w.on('console', (m) => log.push(`[worker ${m.type()}] ${m.text()}`));
    });
    await page.goto(served.url);
    return {
      page,
      log,
      close: async () => {
        await browser.close();
        served.stop();
      },
    };
  });
}
