import { describe, expect, it } from 'bun:test';

import { makeTrack } from '../../../render/scene/trackFixture';
import { NONE, READINGS } from '../../readings';
import { nowAt } from '../moment';
import { survCells } from './cells';

const NOW = 1000;

const cellsOf = (over: Parameters<typeof makeTrack>[0]) => survCells(nowAt(makeTrack(over), NOW));

describe('survCells', () => {
  it('reads the position, the surveillance quality and the reception, in their order', () => {
    // Arrange
    const t = makeTrack({ messageRate: 4.2, rssi: -12.3 });

    // Act
    const cells = survCells(nowAt(t, NOW));

    // Assert
    expect(cells.map((c) => [c.key, c.k, c.r, c.dim])).toEqual([
      ['pos', 'POSITION', { v: '33.60000 130.50000' }, false],
      ['nic', 'NIC', READINGS.nic.format(t), false],
      ['nacp', 'NACP', READINGS.nacp.format(t), false],
      ['src', 'SRC', READINGS.src.format(t), false],
      ['rssi', 'RSSI', { v: '-12.3', unit: 'dB' }, false],
      ['msgs', 'MSGS', { v: '4.2', unit: '/s' }, false],
      ['age', 'SEEN / POS', { v: '0.2 / 0.2', unit: 's' }, false],
    ]);
  });

  it('dashes and dims a position the target has none of, and any reading it lacks', () => {
    // Arrange
    const over = { at: undefined, position: { kind: 'none' }, rssi: undefined } as const;

    // Act
    const dimmed = cellsOf(over)
      .filter((c) => c.dim)
      .map((c) => [c.key, c.r]);

    // Assert
    expect(dimmed).toEqual([
      ['pos', NONE],
      ['rssi', NONE],
      ['msgs', NONE],
    ]);
  });

  it('dims the age of a position that is stale', () => {
    // Arrange
    const rows = [{ seenPos: 29 }, { seenPos: 31 }];

    // Act
    const dims = rows.map((over) => cellsOf(over).find((c) => c.key === 'age')?.dim);

    // Assert
    expect(dims).toEqual([false, true]);
  });
});
