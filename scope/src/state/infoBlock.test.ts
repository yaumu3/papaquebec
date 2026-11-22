import { describe, expect, it } from 'bun:test';

import type { Notice } from './feedLine';
import { infoBlockLabel, type InfoLine, infoLine, nextInfoPage, tapInfoBlock } from './infoBlock';
import type { QnhStatus } from './qnhStatus';
import { INFO_PAGES, type InfoPage } from './settingsDefaults';

const qnh: QnhStatus = { value: '30.18', source: 'RJTT 0030Z', cls: null };
const readouts = { qnh, tracks: 10, rate: 412 };
const stale: Notice = { cls: 'warn', text: 'STALE 7s' };
const connecting: Notice = { cls: 'warn', text: 'CONNECTING' };
const dead: Notice = { cls: 'err', text: 'DEAD · no data' };

describe('infoLine', () => {
  it('tells the line of each page, a notice taking the place of the page value', () => {
    // Arrange
    const rows: [string, InfoPage, Partial<typeof readouts>, Notice | null, InfoLine][] = [
      [
        'qnh',
        'qnh',
        {},
        null,
        {
          key: 'qnh',
          label: 'QNH',
          value: '30.18',
          unit: '',
          cls: null,
          lamp: null,
          spoken: 'QNH 30.18 inches',
        },
      ],
      [
        'qnh warn',
        'qnh',
        { qnh: { ...qnh, cls: 'warn' } },
        null,
        {
          key: 'qnh',
          label: 'QNH',
          value: '30.18',
          unit: '',
          cls: 'warn',
          lamp: null,
          spoken: 'QNH 30.18 inches',
        },
      ],
      [
        'tracks',
        'tracks',
        {},
        null,
        {
          key: 'tracks',
          label: '',
          value: '10',
          unit: 'TRK',
          cls: null,
          lamp: null,
          spoken: '10 tracks',
        },
      ],
      [
        'one track',
        'tracks',
        { tracks: 1 },
        null,
        {
          key: 'tracks',
          label: '',
          value: '1',
          unit: 'TRK',
          cls: null,
          lamp: null,
          spoken: '1 track',
        },
      ],
      [
        'rate',
        'rate',
        {},
        null,
        {
          key: 'rate',
          label: '',
          value: '412',
          unit: 'msg/s',
          cls: null,
          lamp: null,
          spoken: '412 messages per second',
        },
      ],
      [
        'one message',
        'rate',
        { rate: 1 },
        null,
        {
          key: 'rate',
          label: '',
          value: '1',
          unit: 'msg/s',
          cls: null,
          lamp: null,
          spoken: '1 message per second',
        },
      ],
      [
        'stale over qnh',
        'qnh',
        {},
        stale,
        {
          key: 'notice',
          label: '',
          value: 'STALE 7s',
          unit: '',
          cls: 'warn',
          lamp: 'warn',
          spoken: 'STALE 7s',
        },
      ],
      [
        'connecting over tracks',
        'tracks',
        {},
        connecting,
        {
          key: 'notice',
          label: '',
          value: 'CONNECTING',
          unit: '',
          cls: 'warn',
          lamp: 'warn',
          spoken: 'CONNECTING',
        },
      ],
      [
        'dead over rate',
        'rate',
        {},
        dead,
        {
          key: 'notice',
          label: '',
          value: 'DEAD · no data',
          unit: '',
          cls: 'err',
          lamp: 'err',
          spoken: 'DEAD · no data',
        },
      ],
    ];

    // Act
    const lines = rows.map(([, page, over, notice]) =>
      infoLine(page, { ...readouts, ...over }, notice),
    );

    // Assert
    expect(lines).toEqual(rows.map(([, , , , line]) => line));
  });
});

describe('nextInfoPage', () => {
  it('goes on to the next page and wraps from the last to the first', () => {
    // Arrange
    const pages = [...INFO_PAGES];

    // Act
    const next = pages.map(nextInfoPage);

    // Assert
    expect(next).toEqual(['tracks', 'rate', 'qnh']);
  });
});

describe('tapInfoBlock', () => {
  it('advances the page, and leaves it under a notice', () => {
    // Arrange
    const rows: [InfoPage, Notice | null, InfoPage][] = [
      ['qnh', null, 'tracks'],
      ['tracks', null, 'rate'],
      ['rate', null, 'qnh'],
      ['qnh', stale, 'qnh'],
      ['tracks', connecting, 'tracks'],
      ['rate', dead, 'rate'],
    ];

    // Act
    const pages = rows.map(([page, notice]) => tapInfoBlock(page, notice));

    // Assert
    expect(pages).toEqual(rows.map(([, , page]) => page));
  });
});

describe('infoBlockLabel', () => {
  it('reads the clock, then the line spelled out', () => {
    // Arrange
    const line = infoLine('qnh', readouts, null);

    // Act
    const label = infoBlockLabel('00:32:27Z', line);

    // Assert
    expect(label).toBe('00:32:27Z, QNH 30.18 inches');
  });
});
