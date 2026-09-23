import { describe, expect, it } from 'bun:test';

import { hpaToInHg, parseMetarQnh } from './metar';

describe('hpaToInHg', () => {
  it('converts standard pressure to 29.92 rounded to a hundredth', () => {
    // Arrange
    const hpa = [1013.25, 1014, 990];

    // Act
    const out = hpa.map(hpaToInHg);

    // Assert
    expect(out).toEqual([29.92, 29.94, 29.23]);
  });
});

describe('parseMetarQnh', () => {
  const now = new Date('2026-09-22T11:30:00Z');

  it('reads the station, observation time and a Q group in hPa', () => {
    // Arrange
    const raw = 'RJAA 221100Z 10005KT 9999 VCSH FEW045 23/22 Q1014 NOSIG';

    // Act
    const out = parseMetarQnh(raw, now);

    // Assert
    expect(out).toEqual({
      station: 'RJAA',
      observedAt: Date.parse('2026-09-22T11:00:00Z'),
      qnhInHg: 29.94,
    });
  });

  it('reads an A group in hundredths of inHg and tolerates a METAR prefix', () => {
    // Arrange
    const raw = 'METAR KJFK 221051Z 18004KT 10SM FEW250 24/16 A3003 RMK AO2';

    // Act
    const out = parseMetarQnh(raw, now);

    // Assert
    expect(out?.qnhInHg).toBe(30.03);
    expect(out?.station).toBe('KJFK');
  });

  it('places an observation day later than today in the previous month', () => {
    // Arrange
    const raw = 'RJAA 302350Z 00000KT CAVOK 20/10 Q1020';
    const early = new Date('2026-10-01T00:20:00Z');

    // Act
    const out = parseMetarQnh(raw, early);

    // Assert
    expect(out?.observedAt).toBe(Date.parse('2026-09-30T23:50:00Z'));
  });

  it('returns null when the report has no pressure group or no header', () => {
    // Arrange
    const cases = ['RJAA 221100Z 10005KT CAVOK 23/22', '', 'No METAR available for XXXX'];

    // Act
    const out = cases.map((raw) => parseMetarQnh(raw, now));

    // Assert
    expect(out).toEqual([null, null, null]);
  });
});
