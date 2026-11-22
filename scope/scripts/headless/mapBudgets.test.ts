import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fc from 'fast-check';

import { budgetsFrom, complaintsOf, loadBudgets, saveBudgets } from './mapBudgets';

const BUDGETS = { tolerance: 3, medianMs: { topology: 10, labels: 20 } };

describe('complaintsOf', () => {
  it('passes a median within the tolerance of its budget', () => {
    // Arrange
    const medians = { topology: 30, labels: 25 };

    // Act
    const complaints = complaintsOf(medians, BUDGETS);

    // Assert
    expect(complaints).toEqual([]);
  });

  it('fails a median beyond the tolerance', () => {
    // Arrange
    const medians = { topology: 30.5, labels: 25 };

    // Act
    const complaints = complaintsOf(medians, BUDGETS);

    // Assert
    expect(complaints).toEqual(['topology: 30.5 ms, over 3 × its 10 ms']);
  });

  it('fails a step with no budget, and a budget with no step', () => {
    // Arrange
    const medians = { topology: 10, places: 1 };

    // Act
    const complaints = complaintsOf(medians, BUDGETS);

    // Assert
    expect(complaints).toEqual(['places: no budget', 'labels: no such step']);
  });
});

describe('budgetsFrom', () => {
  it('takes the medians rounded up, a millisecond at the least, which the medians then pass', () => {
    // Arrange: medians to the hundredth of a millisecond
    const anyMedian = fc.nat(50_000).map((hundredths) => hundredths / 100);
    const anyMedians = fc.dictionary(fc.constantFrom('topology', 'labels', 'highlight'), anyMedian);
    const anyTolerance = fc.integer({ min: 1, max: 5 });

    fc.assert(
      fc.property(anyMedians, anyTolerance, (medians, tolerance) => {
        // Act
        const budgets = budgetsFrom(medians, tolerance);

        // Assert
        const steps = Object.keys(medians);
        const budgeted = steps.map((step) => ({
          median: medians[step] ?? NaN,
          ms: budgets.medianMs[step] ?? NaN,
        }));
        expect(budgets.tolerance).toBe(tolerance);
        expect(Object.keys(budgets.medianMs)).toEqual(steps);
        expect(
          budgeted.every(
            ({ median, ms }) =>
              Number.isInteger(ms) && ms >= 1 && ms >= median && (ms === 1 || ms - median < 1),
          ),
        ).toBe(true);
        expect(complaintsOf(medians, budgets)).toEqual([]);
      }),
    );
  });
});

describe('saveBudgets', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'budgets-')), 'map-budgets.json');

  it('round-trips the file', () => {
    // Arrange
    const budgets = budgetsFrom({ topology: 10.2 }, 3);

    // Act
    saveBudgets(file, budgets);

    // Assert
    expect(loadBudgets(file)).toEqual(budgets);
  });

  it('writes what the formatter would, to keep the checks quiet', () => {
    // Arrange
    const budgets = budgetsFrom({ topology: 10.2 }, 3);

    // Act
    saveBudgets(file, budgets);

    // Assert
    expect(readFileSync(file, 'utf8')).toBe(
      '{\n  "tolerance": 3,\n  "medianMs": {\n    "topology": 11\n  }\n}\n',
    );
  });
});
