import { afterEach, describe, expect, it } from 'bun:test';

import type { ResolutionAdvisory, Threat } from '../../../lib/acas';
import { turn } from '../../../lib/geo';
import { direct } from '../../../lib/geodesic';
import { INSTRUMENT_SEC } from '../../../lib/reports';
import { RAD } from '../../../lib/units';
import { makeTrack } from '../../../render/scene/trackFixture';
import { setDeclinationAt } from '../../../state/magnetic';
import type { Track } from '../../../state/track';
import { ndGeometry, ndPoint, pxOf } from './geometry';
import type { NdFrame } from './readout';
import {
  nearOnPlane,
  ndTraffic,
  relativeAltitudeLabel,
  symbolAt,
  type TrafficSymbol,
  trafficAround,
  trafficKind,
  verticalArrow,
} from './traffic';

const NOW = 1000;
const FRESH = NOW - 1;

describe('relativeAltitudeLabel', () => {
  it('reads hundreds of feet with the sign of the rounded value, two digits at least', () => {
    // Arrange
    const rows = [0, -40, -900, 2700, 1100, 3100, -10500, 50, -50, 49, -49, -51];

    // Act
    const labels = rows.map(relativeAltitudeLabel);

    // Assert
    expect(labels).toEqual([
      '+00',
      '+00',
      '-09',
      '+27',
      '+11',
      '+31',
      '-105',
      '+01',
      '-01',
      '+00',
      '+00',
      '-01',
    ]);
  });
});

describe('verticalArrow', () => {
  it('shows an arrow from 500 fpm either way while the rate holds', () => {
    // Arrange
    const held = { verticalRate: FRESH };
    const rows = [
      makeTrack({ verticalRate: 499, heard: held }),
      makeTrack({ verticalRate: 500, heard: held }),
      makeTrack({ verticalRate: -499, heard: held }),
      makeTrack({ verticalRate: -500, heard: held }),
      makeTrack({ verticalRate: 2000, heard: { verticalRate: NOW - INSTRUMENT_SEC } }),
      makeTrack({ verticalRate: undefined, heard: held }),
    ];

    // Act
    const arrows = rows.map((t) => verticalArrow(t, NOW));

    // Assert
    expect(arrows).toEqual([undefined, '↑', undefined, '↓', undefined, undefined]);
  });
});

describe('trafficKind', () => {
  it('is proximate within 6 NM and 1,200 ft, the edges included', () => {
    // Arrange
    const rows: [number, number][] = [
      [6, 0],
      [6.01, 0],
      [1, 1200],
      [1, -1200],
      [1, 1201],
      [1, -1201],
    ];

    // Act
    const kinds = rows.map(([nm, ft]) => trafficKind(nm, ft));

    // Assert
    expect(kinds).toEqual(['proximate', 'other', 'proximate', 'proximate', 'other', 'other']);
  });
});

const OWN_AT = { lat: 35.55, lon: 139.78 };
const G = ndGeometry(346);
const EDGE_NM = (20 * (G.r - 4)) / G.r;

afterEach(() => {
  setDeclinationAt(() => () => 0);
});

const ownShip = (over: Partial<Track> = {}): Track =>
  makeTrack({
    hex: 'own',
    alt: 30000,
    at: OWN_AT,
    position: { kind: 'live', ...OWN_AT, x: 0, y: 0 },
    heard: { position: FRESH, alt: FRESH },
    ...over,
  });

/** Traffic `nm` from own ship on the true bearing, with the plane's x/y set to match, stretched by `stretch`. */
const traffic = (
  hex: string,
  bearing: number,
  nm: number,
  over: Partial<Track> = {},
  stretch = 1,
): Track => {
  const p = direct(OWN_AT, bearing, nm);
  return makeTrack({
    hex,
    alt: 30000,
    at: p,
    position: {
      kind: 'live',
      ...p,
      x: nm * stretch * Math.sin(bearing * RAD),
      y: nm * stretch * Math.cos(bearing * RAD),
    },
    heard: { position: FRESH, alt: FRESH },
    ...over,
  });
};

const view = (orient = 0, rangeNm = 20, mode: NdFrame['mode'] = 'heading') => ({
  frame: { mode, orient },
  rangeNm,
  g: G,
});
const hexes = (placed: { track: Track }[]): string[] => placed.map((p) => p.track.hex);

describe('trafficAround', () => {
  it('keeps traffic within 2,700 ft of own ship and drops what is further', () => {
    // Arrange
    const others = [
      traffic('up', 0, 5, { alt: 32700 }),
      traffic('down', 0, 5, { alt: 27300 }),
      traffic('high', 0, 5, { alt: 32701 }),
      traffic('low', 0, 5, { alt: 27299 }),
    ];

    // Act
    const placed = trafficAround(ownShip(), others, NOW, view());

    // Assert
    expect(hexes(placed)).toEqual(['up', 'down']);
  });

  it('drops ground traffic, an altitude not held, a stale or absent position, and own ship', () => {
    // Arrange
    const others = [
      traffic('ground', 0, 5, { alt: 'ground' }),
      traffic('noalt', 0, 5, { heard: { position: FRESH, alt: NOW - INSTRUMENT_SEC } }),
      traffic('stale', 0, 5, { heard: { position: NOW - INSTRUMENT_SEC, alt: FRESH } }),
      traffic('nowhere', 0, 5, { position: { kind: 'none' } }),
      traffic('own', 0, 5),
      traffic('kept', 0, 5),
    ];

    // Act
    const placed = trafficAround(ownShip(), others, NOW, view());

    // Assert
    expect(hexes(placed)).toEqual(['kept']);
  });

  it('keeps what lies inside the arc and the range and drops what lies outside', () => {
    // Arrange
    const others = [
      traffic('arc-in', 74.9, 5),
      traffic('arc-out', 75.1, 5),
      traffic('arc-out-left', 284.9, 5),
      traffic('range-in', 0, EDGE_NM - 0.01),
      traffic('range-out', 0, EDGE_NM + 0.01),
    ];

    // Act
    const placed = trafficAround(ownShip(), others, NOW, view());

    // Assert
    expect(hexes(placed)).toEqual(['arc-in', 'range-in']);
  });

  it('draws nothing from an own ship without a position, an altitude held or the air', () => {
    // Arrange
    const owns = [
      ownShip({ position: { kind: 'none' } }),
      ownShip({ heard: { position: NOW - INSTRUMENT_SEC, alt: FRESH } }),
      ownShip({ alt: 'ground' }),
      ownShip({ heard: { position: FRESH, alt: NOW - INSTRUMENT_SEC } }),
    ];
    const others = [traffic('a', 0, 5)];

    // Act
    const placed = owns.map((own) => trafficAround(own, others, NOW, view()));

    // Assert
    expect(placed.map(hexes)).toEqual([[], [], [], []]);
  });

  it('places traffic by the magnetic bearing relative to the top, at the scale of the range', () => {
    // Arrange
    setDeclinationAt(() => () => 7);
    const others = [traffic('ahead', 97, 5)];

    // Act
    const [first] = trafficAround(ownShip(), others, NOW, view(90));

    // Assert
    expect(first?.x).toBeCloseTo(G.cx, 3);
    expect(first?.y).toBeCloseTo(G.cy - pxOf(G, 5, 20), 3);
  });

  it('puts traffic at own ship exactly at the centre, not at NaN', () => {
    // Arrange
    const others = [
      traffic('same', 0, 5, { at: OWN_AT, position: { kind: 'live', ...OWN_AT, x: 0, y: 0 } }),
    ];

    // Act
    const [first] = trafficAround(ownShip(), others, NOW, view(123));

    // Assert
    expect([first?.x, first?.y]).toEqual([G.cx, G.cy]);
  });

  it('keeps traffic the geodesic holds although the plane puts it past the range', () => {
    // Arrange
    const edge = EDGE_NM - 0.01;
    const stretched = traffic('far', 0, edge, {}, 1.05);

    // Act
    const [first] = trafficAround(ownShip(), [stretched], NOW, view());

    // Assert
    expect(first?.x).toBeCloseTo(G.cx, 3);
    expect(first?.y).toBeCloseTo(G.cy - pxOf(G, edge, 20), 3);
  });

  it('reports the distance and the relative altitude of what it places', () => {
    // Arrange
    const others = [traffic('a', 0, 5, { alt: 29600 })];

    // Act
    const [first] = trafficAround(ownShip(), others, NOW, view());

    // Assert
    expect(first?.distanceNm).toBeCloseTo(5, 3);
    expect(first?.deltaFt).toBe(-400);
  });
});

describe('nearOnPlane', () => {
  it('keeps a target a little past the limit and drops one far past it', () => {
    // Arrange
    const own = { x: 0, y: 0 };
    const rows = [
      { x: 0, y: 21 },
      { x: 0, y: 40 },
      { x: -21, y: 0 },
    ];

    // Act
    const near = rows.map((b) => nearOnPlane(own, b, 20));

    // Assert
    expect(near).toEqual([true, false, true]);
  });
});

describe('ndTraffic', () => {
  it('lists the other traffic before the proximate, whatever the order it came in', () => {
    // Arrange
    const others = [traffic('near', 10, 3), traffic('far', 20, 10)];

    // Act
    const result = ndTraffic(ownShip(), others, NOW, view());

    // Assert
    expect(result.symbols.map((s) => s.kind)).toEqual(['other', 'proximate']);
  });

  it('puts the label 12 px above traffic above or level, 12 px below traffic below', () => {
    // Arrange
    const others = [
      traffic('above', 0, 10, { alt: 31100 }),
      traffic('level', 20, 10, { alt: 29960 }),
      traffic('below', 40, 10, { alt: 29100 }),
    ];

    // Act
    const result = ndTraffic(ownShip(), others, NOW, view());

    // Assert
    expect(result.symbols.map((s) => [s.label?.text, (s.label?.y ?? 0) - s.y])).toEqual([
      ['+11', -12],
      ['+00', -12],
      ['-09', 12],
    ]);
    expect(result.symbols.map((s) => (s.label?.x ?? 0) - s.x)).toEqual([0, 0, 0]);
  });

  it('puts the arrow 9 px right of the symbol at its height, when the rate calls for one', () => {
    // Arrange
    const held = { position: FRESH, alt: FRESH, verticalRate: FRESH };
    const others = [
      traffic('climbing', 0, 10, { verticalRate: 1500, heard: held }),
      traffic('level', 20, 10),
    ];

    // Act
    const result = ndTraffic(ownShip(), others, NOW, view());

    // Assert
    const arrows = result.symbols.map(
      (s) => s.arrow && [s.arrow.glyph, s.arrow.x - s.x, s.arrow.y - s.y],
    );
    expect(arrows).toEqual([['↑', 9, 0], undefined]);
  });

  it('draws nothing, and annunciates nothing, on a display that is lost or blank', () => {
    // Arrange
    const own = ownShip({ ra: advisory({ address: 'thr' }) });
    const rows = [
      [traffic('thr', 10, 4), traffic('a', 0, 5)],
      [traffic('thr', 0, 30), traffic('a', 0, 5)],
    ];
    const frames = (['lost', 'blank'] as const).map((mode) => view(0, 20, mode));
    const none = { symbols: [], traffic: false, offscale: false };

    // Act
    const results = frames.flatMap((v) => rows.map((others) => ndTraffic(own, others, NOW, v)));

    // Assert
    expect(results).toEqual(Array.from({ length: 4 }, () => none));
  });
});

const advisory = (threat: Threat | undefined, terminated = false): ResolutionAdvisory => ({
  multipleThreats: false,
  terminated,
  ...(threat && { threat }),
});

describe('ndTraffic threat by address', () => {
  it('draws the threat last, once, with the traffic around it', () => {
    // Arrange
    const own = ownShip({ ra: advisory({ address: 'thr' }) });
    const others = [traffic('thr', 10, 4), traffic('other', 20, 10)];

    // Act
    const result = ndTraffic(own, others, NOW, view());

    // Assert
    expect(result.symbols.map((s) => s.kind)).toEqual(['other', 'threat']);
    expect(result.traffic).toBe(true);
  });

  it('draws a threat outside the band when it lies in the arc, with its three-digit label', () => {
    // Arrange
    const own = ownShip({ ra: advisory({ address: 'thr' }) });
    const others = [traffic('thr', 10, 4, { alt: 33100 })];

    // Act
    const result = ndTraffic(own, others, NOW, view());

    // Assert
    expect(result.symbols.map((s) => [s.kind, s.label?.text])).toEqual([['threat', '+31']]);
  });

  it('annunciates TRAFFIC without a symbol for a threat that no track matches', () => {
    // Arrange
    const own = ownShip({ ra: advisory({ address: 'ghost' }) });
    const others = [traffic('a', 10, 4)];

    // Act
    const result = ndTraffic(own, others, NOW, view());

    // Assert
    expect(result.symbols.map((s) => s.kind)).toEqual(['proximate']);
    expect(result.traffic).toBe(true);
  });

  it('draws no threat for a terminated advisory, or for none, and no TRAFFIC', () => {
    // Arrange
    const rows = [advisory({ address: 'thr' }, true), undefined];
    const others = [traffic('thr', 10, 4)];

    // Act
    const results = rows.map((ra) => ndTraffic(ownShip({ ra }), others, NOW, view()));

    // Assert
    expect(results.map((r) => [r.symbols.map((s) => s.kind), r.traffic])).toEqual([
      [['proximate'], false],
      [['proximate'], false],
    ]);
  });

  it('draws no symbol for a threat whose altitude is not held, but still TRAFFIC', () => {
    // Arrange
    const own = ownShip({ ra: advisory({ address: 'thr' }) });
    const others = [
      traffic('thr', 10, 4, { heard: { position: FRESH, alt: NOW - INSTRUMENT_SEC } }),
    ];

    // Act
    const result = ndTraffic(own, others, NOW, view());

    // Assert
    expect(result.symbols).toEqual([]);
    expect(result.traffic).toBe(true);
  });
});

describe('ndTraffic threat by position', () => {
  const HELD = { position: FRESH, alt: FRESH, heading: FRESH };
  const byPosition = (threat: Threat, over: Partial<Track> = {}): Track =>
    ownShip({ heading: 152, heard: HELD, ra: advisory(threat), ...over });

  it('keys each symbol by its track, and the threat placed by range and bearing as the estimate', () => {
    // Arrange
    const own = byPosition({ range: 3, bearing: 20, altitude: 29600 });
    const others = [traffic('near', 150, 3)];

    // Act
    const result = ndTraffic(own, others, NOW, view(150));

    // Assert
    expect(result.symbols.map((s) => s.key)).toEqual(['near', 'estimate']);
  });

  it('places it at its range, on its bearing from the heading, with the label of its altitude', () => {
    // Arrange
    const own = byPosition({ range: 3, bearing: 20, altitude: 29600 });
    const [x, y] = ndPoint(G, turn(150, 152 + 20), pxOf(G, 3, 20));

    // Act
    const result = ndTraffic(own, [], NOW, view(150));

    // Assert
    expect(result.symbols.map((s) => [s.kind, s.x, s.y, s.label?.text])).toEqual([
      ['threat', x, y, '-04'],
    ]);
    expect(result.traffic).toBe(true);
  });

  it('places nothing without a held heading, nor without a range or a bearing, but still TRAFFIC', () => {
    // Arrange
    const owns = [
      byPosition({ range: 3, bearing: 20 }, { heard: { ...HELD, heading: NOW - INSTRUMENT_SEC } }),
      byPosition(
        { range: 3, bearing: 20 },
        { heading: undefined, heard: { position: FRESH, alt: FRESH } },
      ),
      byPosition({ bearing: 20 }),
      byPosition({ range: 3 }),
    ];

    // Act
    const results = owns.map((own) => ndTraffic(own, [], NOW, view(150)));

    // Assert
    expect(results.map((r) => [r.symbols, r.traffic])).toEqual([
      [[], true],
      [[], true],
      [[], true],
      [[], true],
    ]);
  });

  it('places it without own ship held position', () => {
    // Arrange
    const own = byPosition({ range: 3, bearing: 20 }, { position: { kind: 'none' } });

    // Act
    const result = ndTraffic(own, [], NOW, view(150));

    // Assert
    expect(result.symbols.map((s) => s.kind)).toEqual(['threat']);
  });

  it('gives no label without the threat altitude or without own altitude held', () => {
    // Arrange
    const owns = [
      byPosition({ range: 3, bearing: 20 }),
      byPosition(
        { range: 3, bearing: 20, altitude: 29600 },
        { heard: { ...HELD, alt: NOW - INSTRUMENT_SEC } },
      ),
    ];

    // Act
    const results = owns.map((own) => ndTraffic(own, [], NOW, view(150)));

    // Assert
    expect(results.map((r) => r.symbols.map((s) => s.label))).toEqual([[undefined], [undefined]]);
  });
});

describe('ndTraffic offscale', () => {
  const HELD = { position: FRESH, alt: FRESH, heading: FRESH };
  const own = (threat: Threat | undefined, over: Partial<Track> = {}, terminated = false): Track =>
    ownShip({ heading: 0, heard: HELD, ra: threat && advisory(threat, terminated), ...over });

  it('is annunciated for a threat with a known position that falls outside what is drawn', () => {
    // Arrange
    const rows: [Track, Track[], ReturnType<typeof view>][] = [
      [own({ address: 't' }), [traffic('t', 0, 12.5)], view(0, 10)],
      [own({ address: 't' }), [traffic('t', 0, 60)], view(0, 10)],
      [own({ address: 't' }), [traffic('t', 80, 5)], view(0, 10)],
      [own({ range: 15, bearing: 20 }), [], view(0, 10)],
      [own({ address: 't' }, { heading: undefined }), [traffic('t', 0, 12.5)], view(0, 10)],
    ];

    // Act
    const results = rows.map(([o, others, v]) => ndTraffic(o, others, NOW, v).offscale);

    // Assert
    expect(results).toEqual([true, true, true, true, true]);
  });

  it('is not annunciated for a threat that is drawn, cannot be placed or is not active', () => {
    // Arrange
    const rows: [Track, Track[], ReturnType<typeof view>][] = [
      [own({ address: 't' }), [traffic('t', 0, 12.5)], view(0, 20)],
      [own({ address: 't' }), [traffic('t', 0, 5, { alt: 33100 })], view(0, 10)],
      [own({ address: 'ghost' }), [traffic('t', 0, 12.5)], view(0, 10)],
      [own({ range: 15, bearing: 20 }, { heading: undefined }), [], view(0, 10)],
      [
        own({ range: 15, bearing: 20 }, { heard: { ...HELD, heading: NOW - INSTRUMENT_SEC } }),
        [],
        view(0, 10),
      ],
      [own({ address: 't' }, {}, true), [traffic('t', 0, 12.5)], view(0, 10)],
      [own(undefined), [traffic('t', 0, 12.5)], view(0, 10)],
      [own({ address: 't' }, { position: { kind: 'none' } }), [traffic('t', 0, 12.5)], view(0, 10)],
      [own({ address: 't' }), [traffic('t', 0, 12.5, { position: { kind: 'none' } })], view(0, 10)],
    ];

    // Act
    const results = rows.map(([o, others, v]) => ndTraffic(o, others, NOW, v).offscale);

    // Assert
    expect(results).toEqual(rows.map(() => false));
  });
});

describe('symbolAt', () => {
  it('moves the label and the arrow with the symbol, and a bare symbol as it is', () => {
    // Arrange
    const full: TrafficSymbol = {
      kind: 'other',
      key: 'a',
      x: 100,
      y: 50,
      label: { text: '+11', x: 100, y: 38 },
      arrow: { glyph: '↑', x: 109, y: 50 },
    };
    const bare: TrafficSymbol = { kind: 'threat', key: 'estimate', x: 100, y: 50 };

    // Act
    const moved = [full, bare].map((symbol) => symbolAt(symbol, 103, 56));

    // Assert
    expect(moved).toEqual([
      {
        kind: 'other',
        key: 'a',
        x: 103,
        y: 56,
        label: { text: '+11', x: 103, y: 44 },
        arrow: { glyph: '↑', x: 112, y: 56 },
      },
      { kind: 'threat', key: 'estimate', x: 103, y: 56 },
    ]);
  });
});
