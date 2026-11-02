/** What the load test does with a map: each action acts through the UI and is timed to its frame. */
import type { Locator, Page } from 'playwright';

import { RANGE_STEPS } from '../../src/state/settingsDefaults';
import { type Chart, importChart } from './browser';
import { type InputKind, NO_POST_MS, REST_MS } from './recorder';
import { canvasBox, inSequence, type Scenario } from './scenarios';

/** Takes one action: `act` gives the input, and the recorder waits until the action has finished. */
async function timed(
  page: Page,
  label: string,
  input: InputKind,
  act: () => Promise<unknown>,
  waitMs = NO_POST_MS,
): Promise<void> {
  await page.evaluate(([l, i]) => window.benchRecorder.action(l, i), [label, input] as const);
  await act();
  await page.evaluate(([w, r]) => window.benchRecorder.acted(w, r), [waitMs, REST_MS] as const);
}

/** A large set is parsed, validated and built before its first post. */
const IMPORT_WAIT_MS = 120_000;

/** Loading the set from the Maps panel: the file's `change`, to the chart's slots posted. */
export const importScenario =
  (chart: Chart): Scenario =>
  (page) =>
    Promise.resolve(() =>
      timed(page, chart.title, 'change', () => importChart(page, chart), IMPORT_WAIT_MS),
    );

/** `times` copies of `items`, in turn. */
const repeated = <T>(items: readonly T[], times: number): T[] =>
  Array.from({ length: times }, () => items).flat();

/** Opens a closed row of the tree: a group or a layer, by the start of its name. */
async function opened(page: Page, name: string): Promise<void> {
  const closed = page.getByRole('button', { name: new RegExp(`^${name}`), expanded: false });
  if ((await closed.count()) > 0) await closed.first().click();
}

const dotOf = (page: Page, name: string) =>
  page.getByRole('button', { name: `Show or hide ${name}`, exact: true });

const rowsOf = (page: Page, layer: string) =>
  page.getByRole('group', { name: `${layer} items`, exact: true }).getByRole('button');

const SECTORS = 'SECTORS';
const AIRWAYS = 'CONVENTIONAL';

/** The tree open as far as a scenario reaches: the groups, and the layers with item rows. */
async function treeReady(page: Page): Promise<void> {
  await inSequence(['AIRSPACE', 'POINTS', 'ROUTES', SECTORS, AIRWAYS], (name) =>
    opened(page, name),
  );
}

/** Each thing `toggle` turns off and on again this many times. */
const TOGGLES = 3;
/** The item rows `point` passes over. */
const POINTED_ROWS = 8;
/** The ranges `settle` zooms around, all below the navaid threshold, in NM. */
const SETTLE_RANGES = [20, 40, 80] as const;
const SETTLE_STEPS = 4;
/** Wheel travel of a zoom step, in px. */
const WHEEL_STEP_PX = 100;
/** The preset just below the navaid threshold: one step up crosses it. */
const BELOW_THRESHOLD_NM = 80;
const CROSSINGS = 6;
const RANGE_KEYS = 1 + RANGE_STEPS.length;
const SEARCHES = 2;
/** How much of a name the search types. */
const QUERY_LENGTH = 4;

/** Goes to a preset of the range: down to the least, then up. */
async function atRange(page: Page, rangeNm: number): Promise<void> {
  // The range keys are left alone while the focus is in the search box.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const up = RANGE_STEPS.findIndex((step) => step === rangeNm);
  const keys = [...Array<string>(RANGE_KEYS).fill('['), ...Array<string>(up).fill(']')];
  await inSequence(keys, (key) => page.keyboard.press(key));
  await page.waitForTimeout(REST_MS);
}

async function overCanvas(page: Page): Promise<void> {
  const b = await canvasBox(page);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
}

/** Taps `target` under a pointer already resting on it, so the tap is all the action does. */
async function tapped(page: Page, label: string, target: Locator): Promise<void> {
  await target.hover();
  await timed(page, label, 'click', () => target.click());
}

const toggle: Scenario = async (page) => {
  await treeReady(page);
  const subjects = [
    [SECTORS, dotOf(page, SECTORS)],
    ['sector item', rowsOf(page, SECTORS).first()],
    ['FIXES', dotOf(page, 'FIXES')],
    ['airway item', rowsOf(page, AIRWAYS).first()],
  ] as const;
  const counts = await inSequence(subjects, ([, target]) => target.count());
  const present = subjects.filter((_, i) => (counts[i] ?? 0) > 0);
  return async () => {
    const offAndOn = present.flatMap((subject) => [subject, subject]);
    await inSequence(repeated(offAndOn, TOGGLES), ([label, target]) => tapped(page, label, target));
  };
};

const settle: Scenario = async (page) => {
  await overCanvas(page);
  const stepAt = (rangeNm: number) => async () => {
    await atRange(page, rangeNm);
    const steps = Array.from({ length: SETTLE_STEPS }, (_, i) => (i % 2 === 0 ? -1 : 1));
    await inSequence(steps, (way) =>
      timed(page, `${rangeNm} NM`, 'settle', () => page.mouse.wheel(0, way * WHEEL_STEP_PX)),
    );
  };
  return async () => {
    await inSequence(SETTLE_RANGES, (rangeNm) => stepAt(rangeNm)());
  };
};

const range: Scenario = async (page) => {
  await atRange(page, BELOW_THRESHOLD_NM);
  const crossings = Array.from({ length: CROSSINGS }, (_, i) => (i % 2 === 0 ? ']' : '['));
  return async () => {
    await inSequence(crossings, (key) =>
      timed(page, key === ']' ? 'out' : 'in', 'keydown', () => page.keyboard.press(key)),
    );
  };
};

const searchOf =
  (name: string): Scenario =>
  async (page) => {
    const box = page.getByLabel('Search layers');
    const typed = Array.from(name.slice(0, QUERY_LENGTH));
    const once = async () => {
      await box.focus();
      await inSequence(typed, (char) =>
        timed(page, 'type', 'keydown', () => page.keyboard.press(char)),
      );
      await tapped(page, 'clear', page.getByRole('button', { name: 'Clear search' }));
    };
    return async () => {
      await inSequence(repeated([once], SEARCHES), (search) => search());
    };
  };

const point: Scenario = async (page) => {
  await treeReady(page);
  const rows = rowsOf(page, AIRWAYS);
  const reached = Math.min(POINTED_ROWS, await rows.count());
  const indices = Array.from({ length: reached }, (_, i) => i);
  await page.mouse.move(0, 0);
  return async () => {
    await inSequence(indices, (i) => timed(page, 'row', 'pointerover', () => rows.nth(i).hover()));
  };
};

/** The scenarios that take a map, in the order they run; `name` is one the search will find. */
export const mapScenarios = (name: string): Record<string, Scenario> => ({
  toggle,
  settle,
  range,
  search: searchOf(name),
  point,
});
