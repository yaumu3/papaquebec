import { describe, expect, it } from 'bun:test';

import { tabFor } from './tabKeys';

describe('tabFor', () => {
  it('names the tab a key moves to, wrapping at the ends, and none for another key', () => {
    // Arrange
    const tabs = ['now', 'history'] as const;
    const rows = [
      { key: 'ArrowRight', current: 'now', want: 'history' },
      { key: 'ArrowRight', current: 'history', want: 'now' },
      { key: 'ArrowLeft', current: 'now', want: 'history' },
      { key: 'ArrowLeft', current: 'history', want: 'now' },
      { key: 'Home', current: 'history', want: 'now' },
      { key: 'End', current: 'now', want: 'history' },
      { key: 'a', current: 'now', want: null },
    ] as const;

    // Act
    const got = rows.map((r) => tabFor(r.key, tabs, r.current));

    // Assert
    expect(got).toEqual(rows.map((r) => r.want));
  });
});
