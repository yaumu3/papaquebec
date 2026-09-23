import { describe, expect, it } from 'bun:test';

import { qnhStatus } from './qnhStatus';

const now = Date.parse('2026-09-22T11:30:00Z');
const report = { station: 'RJAA', observedAt: Date.parse('2026-09-22T11:00:00Z'), qnhInHg: 29.94 };

describe('qnhStatus', () => {
  it('shows the set value with the station and observation time when automatic', () => {
    // Arrange
    const input = { qnhInHg: 29.94, auto: true, station: 'RJAA', report, error: null, now };

    // Act
    const out = qnhStatus(input);

    // Assert
    expect(out).toEqual({ text: 'QNH 29.94 RJAA 1100Z', cls: 'good' });
  });

  it('marks a manual setting and a pending fetch', () => {
    // Arrange
    const manual = { qnhInHg: 29.92, auto: false, station: 'RJAA', report, error: null, now };
    const pending = { qnhInHg: 29.92, auto: true, station: 'RJAA', report: null, error: null, now };
    const unknown = { qnhInHg: 29.92, auto: true, station: '', report: null, error: null, now };

    // Act
    const out = [qnhStatus(manual), qnhStatus(pending), qnhStatus(unknown)];

    // Assert
    expect(out).toEqual([
      { text: 'QNH 29.92 MAN', cls: '' },
      { text: 'QNH 29.92 RJAA ····', cls: 'warn' },
      { text: 'QNH 29.92 ····', cls: 'warn' },
    ]);
  });

  it('warns when the observation is old and flags a failed fetch', () => {
    // Arrange
    const late = now + 3 * 3600_000;
    const stale = { qnhInHg: 29.94, auto: true, station: 'RJAA', report, error: null, now: late };
    const failed = { qnhInHg: 29.94, auto: true, station: 'RJAA', report, error: 'HTTP 503', now };

    // Act
    const out = [qnhStatus(stale), qnhStatus(failed)];

    // Assert
    expect(out).toEqual([
      { text: 'QNH 29.94 RJAA 1100Z', cls: 'warn' },
      { text: 'QNH 29.94 RJAA ERR', cls: 'err' },
    ]);
  });
});
