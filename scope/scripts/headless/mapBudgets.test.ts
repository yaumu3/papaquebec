import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  it('takes the medians rounded up, a millisecond at the least', () => {
    // Arrange
    const medians = { topology: 10.2, labels: 0.3, highlight: 0 };

    // Act
    const budgets = budgetsFrom(medians, 4);

    // Assert
    expect(budgets).toEqual({ tolerance: 4, medianMs: { topology: 11, labels: 1, highlight: 1 } });
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

  it('passes the medians it was updated from', () => {
    // Arrange
    const medians = { topology: 10.2, labels: 0.3 };
    saveBudgets(file, budgetsFrom(medians, 3));

    // Act
    const complaints = complaintsOf(medians, loadBudgets(file));

    // Assert
    expect(complaints).toEqual([]);
  });
});
