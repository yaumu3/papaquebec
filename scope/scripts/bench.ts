/**
 * Load test: the built scope in headless Chromium, fed by the sim with extra traffic, driven
 * through idle, pan, zoom and hover. Reports main-thread frame intervals and long tasks, the
 * messages posted to the render worker (one `layer:<name>` per layer rebuild) with their bytes,
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

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    preview: { type: 'boolean', default: false },
    extra: { type: 'string', default: '300' },
    site: { type: 'string', default: '35.5533,139.7811' }, // RJTT
    seconds: { type: 'string', default: '3' },
    warmup: { type: 'string', default: '6000' },
    fn: {
      type: 'string',
      default: 'buildRings,buildMap,buildTargets,placeLabels,buildHover,buildOverlays,setLayer',
    },
    json: { type: 'string' },
  },
});

interface Sample {
  frames: number[];
  longTasks: number[];
  /** Per message kind: how many were posted to the worker and the bytes of batches they carried. */
  messages: Record<string, { n: number; bytes: number }>;
}

/**
 * Installed once: a long-task observer, a frame-interval recorder and a tap on messages to the
 * render worker, which the scenarios start and stop.
 */
const RECORDER = `(() => {
  const s = { recording: false, frames: [], longTasks: [], messages: {}, last: 0 };
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (m, ...rest) {
    if (s.recording && m && typeof m.type === 'string') {
      const key = m.type === 'layer' ? 'layer:' + m.name : m.type;
      const bytes = (m.batches ?? []).reduce((a, b) => a + b.data.byteLength, 0);
      const e = (s.messages[key] ??= { n: 0, bytes: 0 });
      e.n += 1;
      e.bytes += bytes;
    }
    return post.call(this, m, ...rest);
  };
  new PerformanceObserver((l) => {
    if (s.recording) for (const e of l.getEntries()) s.longTasks.push(e.duration);
  }).observe({ type: 'longtask' });
  const tick = (t) => {
    if (s.recording && s.last) s.frames.push(t - s.last);
    s.last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__bench = {
    start() {
      Object.assign(s, { recording: true, frames: [], longTasks: [], messages: {}, last: 0 });
    },
    stop() {
      s.recording = false;
      return { frames: s.frames, longTasks: s.longTasks, messages: s.messages };
    },
  };
})()`;

const seconds = Number(opt.seconds);
const traced = opt.fn.split(',').filter(Boolean);

/** Runs `work` under the CPU profiler and reports the time in each traced function. */
async function profiled(cdp: CDPSession, work: () => Promise<void>): Promise<Map<string, number>> {
  await cdp.send('Profiler.start');
  await work();
  const { profile } = await cdp.send('Profiler.stop');
  return inclusiveMs(profile, traced);
}

interface Point {
  x: number;
  y: number;
}

/** Runs `step` once per frame, one after another, until `ms` have passed. */
function everyFrame(page: Page, ms: number, step: (i: number) => Promise<void>): Promise<void> {
  const end = Date.now() + ms;
  const go = async (i: number): Promise<void> => {
    if (Date.now() >= end) return;
    await step(i);
    await page.waitForTimeout(16);
    return go(i + 1);
  };
  return go(0);
}

/** The first of `items` that passes `test`, tried one at a time. */
async function firstWhere<T>(
  items: readonly T[],
  test: (item: T) => Promise<boolean>,
): Promise<T | undefined> {
  const [head, ...rest] = items;
  if (head === undefined) return undefined;
  return (await test(head)) ? head : firstWhere(rest, test);
}

/** `fn` over `items`, one after another. */
function inSequence<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  return items.reduce<Promise<R[]>>(
    async (done, item) => [...(await done), await fn(item)],
    Promise.resolve([]),
  );
}

async function canvasBox(page: Page) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('no canvas');
  return box;
}

/** Whether the canvas itself, not a panel over it, takes a press at this point. */
function onCanvas(page: Page, p: Point): Promise<boolean> {
  return page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', p);
}

/** Whether a left drag from `p` pans; it returns to `p` before letting go, whatever it grabbed. */
async function pansFrom(page: Page, p: Point): Promise<boolean> {
  if (!(await onCanvas(page, p))) return false;
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 20, p.y, { steps: 4 });
  const cursor = await page
    .locator('canvas')
    .first()
    .evaluate((c) => c.style.cursor);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.up();
  return cursor === 'move';
}

/**
 * A point where a left drag pans rather than drags out an RBL or moves a block. A missed try
 * ends where it started, so an RBL ends on its own target and a block stays in its corner.
 */
async function panOrigin(page: Page): Promise<Point> {
  const b = await canvasBox(page);
  const grid = Array.from({ length: 81 }, (_, k) => ({
    x: b.x + (b.width * (1 + (k % 9))) / 10,
    y: b.y + (b.height * (1 + Math.floor(k / 9))) / 10,
  }));
  const found = await firstWhere(grid, (p) => pansFrom(page, p));
  if (!found) throw new Error('no empty spot to pan from');
  return found;
}

interface Stage {
  page: Page;
  /** Where a left drag pans, found before recording starts. */
  panFrom: Point;
}

const scenarios: Record<string, (stage: Stage) => Promise<void>> = {
  async idle({ page }) {
    await page.waitForTimeout(seconds * 1000);
  },
  async pan({ page, panFrom: o }) {
    await page.mouse.move(o.x, o.y);
    await page.mouse.down();
    await everyFrame(page, seconds * 1000, (i) =>
      page.mouse.move(o.x + 120 * Math.sin(i / 10), o.y + 60 * Math.sin(i / 7)),
    );
    await page.mouse.up();
  },
  async zoom({ page }) {
    const b = await canvasBox(page);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await everyFrame(page, seconds * 1000, (i) => page.mouse.wheel(0, i % 40 < 20 ? -40 : 40));
  },
  async hover({ page }) {
    const b = await canvasBox(page);
    await everyFrame(page, seconds * 1000, (i) =>
      page.mouse.move(
        b.x + b.width * (0.25 + (0.5 * (i % 120)) / 120),
        b.y + b.height * (0.5 + 0.2 * Math.sin(i / 5)),
      ),
    );
  },
};

const pct = (xs: number[], p: number) => {
  const s = xs.toSorted((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const f1 = (n: number) => n.toFixed(1);

function summarize(name: string, s: Sample, ms: Map<string, number>) {
  return {
    scenario: name,
    frames: s.frames.length,
    frameP50: pct(s.frames, 50),
    frameP95: pct(s.frames, 95),
    frameMax: Math.max(0, ...s.frames),
    janky: s.frames.filter((f) => f > 25).length,
    longTasks: s.longTasks.length,
    longTaskMs: sum(s.longTasks),
    messages: s.messages,
    ms: Object.fromEntries(ms),
  };
}

const { page, log, close } = await openScope({
  url: opt.url,
  preview: opt.preview,
  sim: 1,
  extra: Number(opt.extra),
  site: opt.site,
  scale: 2,
});
try {
  await page.waitForTimeout(Number(opt.warmup));
  await page.evaluate(RECORDER);
  const stage = { page, panFrom: await panOrigin(page) };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  const results = await inSequence(Object.entries(scenarios), async ([name, run]) => {
    await page.evaluate('window.__bench.start()');
    const ms = await profiled(cdp, () => run(stage));
    return summarize(name, await page.evaluate<Sample>('window.__bench.stop()'), ms);
  });
  const status = await page.evaluate(() => document.querySelector('#top-bar')?.textContent ?? '');
  console.log(status);
  for (const r of results) {
    console.log(
      `${r.scenario.padEnd(6)} frames ${String(r.frames).padStart(4)}  ` +
        `p50 ${f1(r.frameP50)} p95 ${f1(r.frameP95)} max ${f1(r.frameMax)} ms  ` +
        `janky ${r.janky}  long ${r.longTasks} (${f1(r.longTaskMs)} ms)`,
    );
    const sent = Object.entries(r.messages).map(
      ([k, m]) => `${k} ×${m.n}${m.bytes ? ` (${f1(m.bytes / 1e6)} MB)` : ''}`,
    );
    console.log(`         sent  ${sent.join('  ')}`);
    const busy = Object.entries(r.ms).filter(([, ms]) => ms > 0);
    console.log(`         time  ${busy.map(([k, ms]) => `${k} ${f1(ms)} ms`).join('  ')}`);
  }
  if (opt.json) writeFileSync(opt.json, JSON.stringify(results, null, 2));
  const errors = log.filter((l) => l.includes('error'));
  if (errors.length) console.log(errors.join('\n'));
} finally {
  await close();
}
