/** What the load test does to the page: each scenario acts on it through the UI. */
import type { Page } from 'playwright';

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

/** A scenario gets ready, then hands over what is recorded. */
export type Scenario = (page: Page) => Promise<() => Promise<void>>;

/**
 * The scenarios that run with or without a map, for `seconds` each. The pan looks for its spot
 * just before it drags, so traffic has no time to move onto it.
 */
export const loadScenarios = (seconds: number): Record<string, Scenario> => ({
  async idle(page) {
    return () => page.waitForTimeout(seconds * 1000);
  },
  async pan(page) {
    const o = await panOrigin(page);
    return async () => {
      await page.mouse.move(o.x, o.y);
      await page.mouse.down();
      await everyFrame(page, seconds * 1000, (i) =>
        page.mouse.move(o.x + 120 * Math.sin(i / 10), o.y + 60 * Math.sin(i / 7)),
      );
      await page.mouse.up();
    };
  },
  async zoom(page) {
    const b = await canvasBox(page);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    return () =>
      everyFrame(page, seconds * 1000, (i) => page.mouse.wheel(0, i % 40 < 20 ? -40 : 40));
  },
  async hover(page) {
    const b = await canvasBox(page);
    return () =>
      everyFrame(page, seconds * 1000, (i) =>
        page.mouse.move(
          b.x + b.width * (0.25 + (0.5 * (i % 120)) / 120),
          b.y + b.height * (0.5 + 0.2 * Math.sin(i / 5)),
        ),
      );
  },
});
