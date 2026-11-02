/**
 * The budgets `bench:map --check` holds the medians to. They come from a run on the developer's
 * machine, with a wide tolerance: they catch a step that became several times slower, not drift.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import * as z from 'zod/mini';

const Budgets = z.object({
  /** How many times its budget a median may take. */
  tolerance: z.number(),
  medianMs: z.record(z.string(), z.number()),
});

export type Budgets = z.infer<typeof Budgets>;

type Medians = Readonly<Record<string, number>>;

/** What `medians` break of `budgets`, if anything. */
export function complaintsOf(medians: Medians, { tolerance, medianMs }: Budgets): string[] {
  const over = Object.entries(medians).flatMap(([step, median]) => {
    const budget = medianMs[step];
    if (budget === undefined) return [`${step}: no budget`];
    return median > budget * tolerance
      ? [`${step}: ${median} ms, over ${tolerance} × its ${budget} ms`]
      : [];
  });
  const gone = Object.keys(medianMs).filter((step) => !(step in medians));
  return [...over, ...gone.map((step) => `${step}: no such step`)];
}

/** Budgets taken from a run: the medians, rounded up, a millisecond at the least. */
export const budgetsFrom = (medians: Medians, tolerance: number): Budgets => ({
  tolerance,
  medianMs: Object.fromEntries(
    Object.entries(medians).map(([step, median]) => [step, Math.max(1, Math.ceil(median))]),
  ),
});

export const loadBudgets = (path: string): Budgets =>
  Budgets.parse(JSON.parse(readFileSync(path, 'utf8')));

export function saveBudgets(path: string, budgets: Budgets): void {
  writeFileSync(path, `${JSON.stringify(budgets, null, 2)}\n`);
}
