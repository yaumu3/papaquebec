import { describe, expect, it } from 'bun:test';

import type { LanesWindow } from '../../state/window';
import { controlLabel } from './control';

describe('controlLabel', () => {
  it('says what the control does in each state, the lag in minutes and seconds', () => {
    // Arrange
    const live: LanesWindow = { kind: 'live', sec: 300 };
    const held: LanesWindow = { kind: 'held', from: 0, to: 300 };
    const rows = [
      { w: live, lag: 0 },
      { w: held, lag: 0 },
      { w: held, lag: 20 },
      { w: held, lag: 180 },
      { w: held, lag: 200.4 },
      { w: held, lag: 3600 },
    ];

    // Act
    const labels = rows.map((r) => controlLabel(r.w, r.lag));

    // Assert
    expect(labels).toEqual([
      'Live; press to hold',
      'Held 0 s back; press to go live',
      'Held 20 s back; press to go live',
      'Held 3 min back; press to go live',
      'Held 3 min 20 s back; press to go live',
      'Held 60 min back; press to go live',
    ]);
  });
});
