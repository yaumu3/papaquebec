import { afterEach, describe, expect, it } from 'bun:test';

import { INSTRUMENT_SEC } from '../../lib/reports';
import { setDeclinationAt } from '../../state/magnetic';
import { makeSample } from '../../state/sampleFixture';
import { ndFrame, oldestHeard } from './readout';

const NOW = 1000;
const FRESH = NOW - 1;
const STALE = NOW - INSTRUMENT_SEC;
const AT = { lat: 35.5, lon: 139.8 };

afterEach(() => {
  setDeclinationAt(() => () => 0);
});

describe('oldestHeard', () => {
  it('takes the earliest instant of the keys heard, none when none is', () => {
    // Arrange
    const heard = { trackRate: 990, gs: 980 };

    // Act
    const out = [
      oldestHeard(heard, ['trackRate', 'gs']),
      oldestHeard(heard, ['gs', 'selAlt']),
      oldestHeard(heard, ['selAlt']),
    ];

    // Assert
    expect(out).toEqual([980, 980, undefined]);
  });
});

describe('ndFrame', () => {
  it('sets the mode, its label, the box and the flags by what holds', () => {
    // Arrange
    const rows = [
      makeSample(NOW, {
        seen: 1,
        heading: 284,
        track: 289,
        heard: { heading: FRESH, track: FRESH },
      }),
      makeSample(NOW, { seen: 1, track: 47, heard: { track: FRESH } }),
      makeSample(NOW, { seen: 34, heading: 201, track: 198, heard: { heading: 966, track: 966 } }),
      makeSample(NOW, {
        seen: 1,
        heading: 201,
        track: 198,
        heard: { heading: STALE, track: STALE },
      }),
      makeSample(NOW, { seen: 1 }),
    ];

    // Act
    const frames = rows.map((t) => ndFrame(t, NOW));

    // Assert
    expect(frames.map((f) => [f.mode, f.label, f.box, f.flags])).toEqual([
      ['heading', 'HDG', '284', []],
      ['track', 'TRK', '047', ['HDG']],
      ['lost', 'HDG', '---', ['TRK', 'HDG']],
      ['blank', 'HDG', '---', ['TRK', 'HDG']],
      ['blank', 'TRK', '---', ['TRK', 'HDG']],
    ]);
  });

  it('orients on the heading, else the track, as heard', () => {
    // Arrange
    const rows = [
      makeSample(NOW, { heading: 284, track: 289, heard: { heading: FRESH, track: FRESH } }),
      makeSample(NOW, { track: 47, heard: { track: FRESH } }),
      makeSample(NOW, { seen: 40, heading: 201, track: 198, heard: { heading: 900, track: 900 } }),
      makeSample(NOW, { seen: 40, track: 198, heard: { track: 900 } }),
      makeSample(NOW, { seen: 40 }),
    ];

    // Act
    const orients = rows.map((t) => ndFrame(t, NOW).orient);

    // Assert
    expect(orients).toEqual([284, 47, 201, 198, 0]);
  });

  it('orients the last frame on the magnetic track', () => {
    // Arrange
    setDeclinationAt(() => () => 7);
    const t = makeSample(NOW, { seen: 40, track: 205, at: AT, heard: { track: 900 } });

    // Act
    const frame = ndFrame(t, NOW);

    // Assert
    expect(frame.orient).toBe(198);
  });

  it('lets a heading heard exactly INSTRUMENT_SEC ago lapse, the track holding', () => {
    // Arrange
    const t = makeSample(NOW, {
      seen: 1,
      heading: 284,
      track: 289,
      heard: { heading: STALE, track: FRESH },
    });

    // Act
    const frame = ndFrame(t, NOW);

    // Assert
    expect([frame.mode, frame.orient]).toEqual(['track', 289]);
  });

  it('says how long ago the target was last heard, only when lost', () => {
    // Arrange
    const rows = [makeSample(NOW, { seen: 34.4 }), makeSample(NOW, { seen: 14.9 })];

    // Act
    const lines = rows.map((t) => ndFrame(t, NOW).lastHeard);

    // Assert
    expect(lines).toEqual(['LAST HEARD 34 s', undefined]);
  });
});
