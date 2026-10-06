import { describe, expect, it } from 'bun:test';

import { qnhAltitudeFt } from '../../lib/altitude';
import { HPA_PER_INHG } from '../../lib/units';
import { setDeclination } from '../../state/magnetic';
import { laneOf, READING_KEYS } from '../../state/plotted';
import { makeSample } from '../../state/sampleFixture';
import { PLOTS } from './plots';

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

  it('plots the track in magnetic, as the table reads it', () => {
    // Arrange
    setDeclination(7);
    const s = makeSample(1, { track: 235 });
    const trk = PLOTS.trk;

    // Act
    const y = trk.kind === 'line' ? trk.y(s) : null;

    // Assert
    expect(y).toBe(228);
    setDeclination(0);
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
});
