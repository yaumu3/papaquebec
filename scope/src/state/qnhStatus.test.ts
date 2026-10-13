import { describe, expect, it } from 'bun:test';

import { qnhStatus } from './qnhStatus';

const report = { station: 'RJAA', observedAt: Date.parse('2026-09-22T11:00:00Z'), qnhInHg: 29.94 };

describe('qnhStatus', () => {
  it('tells the set value apart from the station and observation time it came from', () => {
    // Arrange
    const input = { qnhInHg: 29.94, auto: true, station: 'RJAA', report };

    // Act
    const out = qnhStatus(input);

    // Assert
    expect(out).toEqual({ value: '29.94', source: 'RJAA 1100Z', cls: null });
  });

  it('marks a manual setting and a station yet to report', () => {
    // Arrange
    const manual = { qnhInHg: 29.92, auto: false, station: 'RJAA', report };
    const pending = { qnhInHg: 29.92, auto: true, station: 'RJAA', report: null };
    const unknown = { qnhInHg: 29.92, auto: true, station: '', report: null };

    // Act
    const out = [qnhStatus(manual), qnhStatus(pending), qnhStatus(unknown)];

    // Assert
    expect(out).toEqual([
      { value: '29.92', source: 'MAN', cls: null },
      { value: '29.92', source: 'RJAA --.--', cls: 'warn' },
      { value: '29.92', source: '--.--', cls: 'warn' },
    ]);
  });
});
