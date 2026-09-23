import { describe, expect, it } from 'bun:test';

import { toAero, withinRadius } from './openaip';

const point = (lat: number, lon: number) => ({ type: 'Point', coordinates: [lon, lat] });
const poly = (pts: [number, number][]) => ({
  type: 'Polygon',
  coordinates: [pts.map(([lat, lon]) => [lon, lat])],
});

const site = { lat: 35.765, lon: 140.386 }; // RJAA

describe('withinRadius', () => {
  it('keeps points inside the radius and drops the rest', () => {
    // Arrange
    const near: [number, number] = [35.7, 140.1]; // Chiba
    const far: [number, number] = [43.0, 141.0]; // Sapporo

    // Act
    const out = [near, far].map(([lat, lon]) => withinRadius(site, 300, lat, lon));

    // Assert
    expect(out).toEqual([true, false]);
  });
});

describe('toAero', () => {
  it('maps navaids, airports, reporting points and airspace polygons into the scope format', () => {
    // Arrange
    const input = {
      navaids: [
        { identifier: 'NRE', name: 'NARITA', type: 4, geometry: point(35.76, 140.38) }, // RJAA
        { identifier: 'FAR', name: 'FAR AWAY', type: 3, geometry: point(43.0, 141.0) }, // Sapporo
      ],
      airports: [
        { icaoCode: 'RJAA', name: 'NARITA INTL', type: 0, geometry: point(35.765, 140.386) },
        { name: 'NO CODE', type: 0, geometry: point(35.7, 140.3) }, // near RJAA
      ],
      reportingPoints: [{ name: 'CHIBA', compulsory: true, geometry: point(35.6, 140.1) }], // Chiba
      airspaces: [
        {
          name: 'NARITA CTR',
          type: 4,
          icaoClass: 2,
          lowerLimit: { value: 0, unit: 1, referenceDatum: 0 },
          upperLimit: { value: 3000, unit: 1, referenceDatum: 1 },
          geometry: poly([
            [35.9, 140.2], // around RJAA
            [35.9, 140.6],
            [35.6, 140.6],
            [35.6, 140.2],
            [35.9, 140.2],
          ]),
        },
        {
          name: 'TOKYO FIR',
          type: 10,
          geometry: poly([
            [30, 130], // all of Japan
            [30, 150],
            [45, 150],
            [45, 130],
            [30, 130],
          ]),
        },
        {
          name: 'R-134',
          type: 1,
          geometry: poly([
            [35.5, 140.0], // Ichihara
            [35.5, 140.1],
            [35.4, 140.1],
            [35.5, 140.0],
          ]),
        },
        {
          name: 'IGNORED SPORT',
          type: 28,
          geometry: poly([
            [35.7, 140.1], // Chiba
            [35.7, 140.2],
            [35.6, 140.2],
            [35.7, 140.1],
          ]),
        },
        {
          name: 'TOKYO ACA-3',
          type: 0,
          geometry: poly([
            [35.7, 140.1], // Chiba
            [35.7, 140.2],
            [35.6, 140.2],
            [35.7, 140.1],
          ]),
        },
        {
          name: 'NARITA INFO ZONE-2',
          type: 0,
          geometry: poly([
            [35.7, 140.1], // Chiba
            [35.7, 140.2],
            [35.6, 140.2],
            [35.7, 140.1],
          ]),
        },
        {
          name: 'AKASHI HELI',
          type: 0,
          geometry: poly([
            [35.7, 140.1], // Chiba
            [35.7, 140.2],
            [35.6, 140.2],
            [35.7, 140.1],
          ]),
        },
        {
          name: 'CHOFU AP APPROACH SURFACE-S',
          type: 2,
          geometry: poly([
            [35.7, 140.1], // Chiba
            [35.7, 140.2],
            [35.6, 140.2],
            [35.7, 140.1],
          ]),
        },
      ],
    };

    // Act
    const aero = toAero(input, site, 300);

    // Assert
    expect(aero.navaids).toEqual([{ id: 'NRE', kind: 'VOR-DME', lat: 35.76, lon: 140.38 }]);
    expect(aero.airports).toEqual([{ id: 'RJAA', name: 'NARITA INTL', lat: 35.765, lon: 140.386 }]);
    expect(aero.waypoints).toEqual([{ id: 'CHIBA', lat: 35.6, lon: 140.1 }]);
    const polygons = aero.airspace.filter((a) => 'points' in a);
    expect(polygons.map((a) => [a.name, a.kind, a.dashed])).toEqual([
      ['NARITA CTR', 'CTR', false],
      ['R-134', 'R', true],
      ['TOKYO ACA-3', 'ACA', false],
      ['NARITA INFO ZONE-2', 'INFO', false],
    ]);
    expect(polygons[0]).toMatchObject({ lowerFt: 0, upperFt: 3000 });
    expect(polygons[0]?.points).toHaveLength(5);
    expect(aero.sectors.map((s) => s.name)).toEqual(['TOKYO FIR']);
  });

  it('converts flight-level and meter limits to feet', () => {
    // Arrange
    const input = {
      navaids: [],
      airports: [],
      reportingPoints: [],
      airspaces: [
        {
          name: 'TMA',
          type: 7,
          lowerLimit: { value: 600, unit: 0, referenceDatum: 1 },
          upperLimit: { value: 145, unit: 6, referenceDatum: 2 },
          geometry: poly([
            [35.7, 140.1], // Chiba
            [35.7, 140.2],
            [35.6, 140.2],
            [35.7, 140.1],
          ]),
        },
      ],
    };

    // Act
    const aero = toAero(input, site, 300);

    // Assert
    expect(aero.airspace[0]).toMatchObject({ lowerFt: 1969, upperFt: 14500 });
  });
});
