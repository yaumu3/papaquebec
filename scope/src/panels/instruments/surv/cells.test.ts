import { describe, expect, it } from 'bun:test';

import { LAPSE_SEC } from '../../../lib/reports';
import { makeTrack } from '../../../render/scene/trackFixture';
import { makeSample } from '../../../state/sampleFixture';
import { NONE, READINGS } from '../../readings';
import { nowAt } from '../moment';
import { survCells } from './cells';

const NOW = 1000;

const heardAt = (at: number) => ({ nic: at, rc: at, nacP: at });
const FRESH = heardAt(NOW - 1);

const cellsOf = (over: Parameters<typeof makeTrack>[0]) =>
  survCells(nowAt(makeTrack({ heard: FRESH, ...over }), NOW));

describe('survCells', () => {
  it('reads the position, the surveillance quality and the reception, in their order', () => {
    // Arrange
    const t = makeTrack({ messageRate: 4.2, rssi: -12.3, heard: FRESH });

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

  it('lapses NIC and NACP from the lapse on, as their lanes do', () => {
    // Arrange
    const ages = [29.9, 30, 30.1];

    // Act
    const out = ages.map((age) =>
      cellsOf({ heard: heardAt(NOW - age) })
        .filter((c) => c.key === 'nic' || c.key === 'nacp')
        .map((c) => [c.r === NONE, c.dim]),
    );

    // Assert
    expect(out).toEqual([
      [
        [false, false],
        [false, false],
      ],
      [
        [true, true],
        [true, true],
      ],
      [
        [true, true],
        [true, true],
      ],
    ]);
  });

  it('dims the position once it is as old as the lapse', () => {
    // Arrange
    const ages = [29.9, 30, 30.1];

    // Act
    const dims = ages.map((seenPos) => cellsOf({ seenPos }).find((c) => c.key === 'pos')?.dim);

    // Assert
    expect(dims).toEqual([false, true, true]);
  });

  it('never lapses the source, the signal strength or the message rate', () => {
    // Arrange
    const over = { heard: {}, messageRate: 4.2, rssi: -12.3 };

    // Act
    const cells = cellsOf(over).filter((c) => ['src', 'rssi', 'msgs'].includes(c.key));

    // Assert
    expect(cells.map((c) => [c.key, c.r === NONE, c.dim])).toEqual([
      ['src', false, false],
      ['rssi', false, false],
      ['msgs', false, false],
    ]);
  });
});

describe('survCells at a peeked sample', () => {
  const AGE = 200;
  const T = 1;
  const sampleRows = [
    makeSample(T, {
      at: { lat: 35.5, lon: 139.8 },
      rssi: -9,
      messageRate: 3,
      seen: 2,
      seenPos: 4,
      nic: 8,
      rc: 100,
      nacP: 9,
      heard: heardAt(T),
    }),
    makeSample(T, {
      at: { lat: 35.5, lon: 139.8 },
      rssi: -9,
      messageRate: 3,
      seen: 2,
      seenPos: 31,
      nic: 8,
      rc: 100,
      nacP: 9,
      heard: heardAt(T - LAPSE_SEC),
    }),
    makeSample(T, {
      at: undefined,
      rssi: undefined,
      messageRate: 3,
      seen: 2,
      seenPos: undefined,
      heard: heardAt(T),
    }),
  ];

  it('reads a sample at its own time as a live target whose data has exactly that age', () => {
    // Arrange
    const expected = sampleRows
      .map((s) => makeSample(T + AGE, { ...s, heard: heardAt((s.heard.nic ?? 0) + AGE) }))
      .map((r) => survCells(nowAt(r, T + AGE)));

    // Act
    const peeked = sampleRows.map((r) => survCells({ kind: 'sample', r, instant: r.t }));

    // Assert
    expect(peeked).toEqual(expected);
  });

  it('reads the message rate as a dash where the sample has none', () => {
    // Arrange
    const first = makeSample(T, { messageRate: undefined, heard: heardAt(T) });

    // Act
    const msgs = survCells({ kind: 'sample', r: first, instant: T }).find((c) => c.key === 'msgs');

    // Assert
    expect([msgs?.r, msgs?.dim]).toEqual([NONE, true]);
  });

  it('dashes and dims every cell over a gap, the source too', () => {
    // Arrange
    const empty = { kind: 'empty' } as const;

    // Act
    const cells = survCells(empty);

    // Assert
    expect(cells.map((c) => [c.key, c.r, c.dim])).toEqual(
      (['pos', 'nic', 'nacp', 'src', 'rssi', 'msgs', 'age'] as const).map(
        (key) => [key, NONE, true] as const,
      ),
    );
  });
});
