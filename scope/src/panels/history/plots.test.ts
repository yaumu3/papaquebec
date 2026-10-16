import { describe, expect, it } from 'bun:test';

import { qnhAltitudeFt } from '../../lib/altitude';
import { HPA_PER_INHG } from '../../lib/units';
import { setDeclinationAt } from '../../state/magnetic';
import { laneOf, READING_KEYS } from '../../state/plotted';
import { makeSample } from '../../state/sampleFixture';
import { minSpanOf, PLOTS } from './plots';

describe('PLOTS', () => {
  it('draws an intent inside the lane plotted.ts says it belongs to, and nothing else as one', () => {
    // Arrange
    const keys = READING_KEYS;

    // Act
    const agree = keys.map((k) => (PLOTS[k].kind === 'intent') === (laneOf(k) !== k));

    // Assert
    expect(agree).toEqual(keys.map(() => true));
  });

  it('plots altitude as the crew reads it, the reference their selected altitude is set on', () => {
    // Arrange
    const samples = [
      makeSample(1, { alt: 4750, navQnh: 1023.2 }),
      makeSample(2, { alt: 11000 }),
      makeSample(3, { alt: 'ground' }),
      makeSample(4),
    ];
    const alt = PLOTS.alt;

    // Act
    const ys = samples.map((s) => (alt.kind === 'line' ? alt.y(s) : null));

    // Assert
    expect(ys).toEqual([qnhAltitudeFt(4750, 1023.2 / HPA_PER_INHG), 11000, undefined, undefined]);
  });

  it('keeps a target on the ground on the floor of the altitude lane', () => {
    // Arrange
    const samples = [makeSample(1, { alt: 'ground' }), makeSample(2, { alt: 500 }), makeSample(3)];
    const alt = PLOTS.alt;

    // Act
    const floored = samples.map((s) => alt.kind === 'line' && alt.floor?.(s));

    // Assert
    expect(floored).toEqual([true, false, false]);
  });

  it('reads the track in magnetic, as the table does, with the heading as sent, none without either', () => {
    // Arrange
    setDeclinationAt(() => () => 7);
    const samples = [
      makeSample(1, { track: 235, heading: 240, at: { lat: 33.6, lon: 130.5 } }),
      makeSample(2),
    ];
    const trk = PLOTS.trk;

    // Act
    const headings = samples.map((s) => (trk.kind === 'heading' ? trk.heading(s) : null));

    // Assert
    expect(headings).toEqual([{ trk: 228, hdg: 240 }, undefined]);
    setDeclinationAt(() => () => 0);
  });

  it('names the engaged modes as the table abbreviates them, and the source as one name', () => {
    // Arrange
    const s = makeSample(1, { navModes: ['autopilot', 'vnav'], source: 'mlat' });
    const [modes, src] = [PLOTS.modes, PLOTS.src];

    // Act
    const names = [
      modes.kind === 'gantt' ? modes.names(s) : null,
      src.kind === 'gantt' ? src.names(s) : null,
    ];

    // Assert
    expect(names).toEqual([['AP', 'VNAV'], ['MLAT']]);
  });

  it('pairs the age of the last message with that of the last position', () => {
    // Arrange
    const s = makeSample(1, { seen: 1.5, seenPos: 40 });
    const age = PLOTS.age;

    // Act
    const ys = age.kind === 'pair' ? [age.y(s), age.y2(s)] : null;

    // Assert
    expect(ys).toEqual([1.5, 40]);
  });

  it('reads the selected heading only while it steers, as the data block does', () => {
    // Arrange
    const samples = [
      makeSample(1, { selHeading: 270, navModes: ['autopilot'] }),
      makeSample(2, { selHeading: 270, navModes: ['autopilot', 'lnav'] }),
    ];
    const selHdg = PLOTS.selHdg;

    // Act
    const sels = samples.map((s) => (selHdg.kind === 'intent' ? selHdg.y(s) : null));

    // Assert
    expect(sels).toEqual([270, undefined]);
  });

  it('plots the message rate, and the wind as barbs from its direction and speed', () => {
    // Arrange
    const s = makeSample(1, { messageRate: 1.3, windDir: 300, windSpeed: 12 });
    const [msgs, wind] = [PLOTS.msgs, PLOTS.wind];

    // Act
    const out = [
      msgs.kind === 'line' ? msgs.y(s) : null,
      wind.kind === 'barbs' ? wind.barb(s) : null,
    ];

    // Assert
    expect(out).toEqual([1.3, { dir: 300, speed: 12 }]);
  });

  it('plots the NIC and NACp as the powers of ten of their bounds, none where they bound nothing', () => {
    // Arrange
    const samples = [
      makeSample(1, { nic: 8, rc: 186, nacP: 9 }),
      makeSample(2, { nic: 6, nacP: 0 }),
      makeSample(3, { nic: 0 }),
      makeSample(4),
    ];
    const [nic, nacp] = [PLOTS.nic, PLOTS.nacp];

    // Act
    const ys = samples.map((s) => [
      nic.kind === 'line' ? nic.y(s) : null,
      nacp.kind === 'line' ? nacp.y(s) : null,
    ]);

    // Assert
    expect(ys).toEqual([
      [Math.log10(186), Math.log10(30)],
      [undefined, undefined],
      [undefined, undefined],
      [undefined, undefined],
    ]);
  });
});

describe('minSpanOf', () => {
  it('spans an intent like the lane it is drawn in, and a lane of glyphs, bars or barbs not at all', () => {
    // Arrange
    const keys = ['selAlt', 'alt', 'selHdg', 'trk', 'modes', 'wind'] as const;

    // Act
    const spans = keys.map(minSpanOf);

    // Assert
    expect(spans).toEqual([1000, 1000, undefined, undefined, undefined, undefined]);
  });
});
