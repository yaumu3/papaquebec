/** The synthetic fleet: fictional targets that exercise every glyph, color and prefix. */
export interface SimAircraft {
  /** From D00000–DFFFFF, which ICAO Annex 10 Vol III reserves for future use, so no real aircraft has it. */
  hex: string;
  flight?: string;
  category: string;
  squawk: string;
  /** Start offset from the site in NM, x east, y north. */
  x: number;
  y: number;
  alt: number;
  gs: number;
  track: number;
  baroRate: number;
  /** Reports "ground" instead of an altitude; `gs` is then taxi speed. */
  ground?: boolean;
  mlat?: boolean;
  /** Autopilot intent it downlinks; it levels off on reaching `selAlt`. */
  selAlt?: number;
  selHeading?: number;
  modes?: string[];
  type: string;
  reg: string;
}

/** A small fleet that exercises every color, glyph and prefix the scope draws. */
export const FLEET: SimAircraft[] = [
  {
    hex: 'd00001',
    flight: 'TEST01',
    category: 'A3',
    squawk: '2431',
    x: 27,
    y: 16,
    alt: 11000,
    gs: 290,
    track: 235,
    baroRate: -1200,
    type: 'B789',
    reg: 'TEST-01',
    selAlt: 6000,
    modes: ['autopilot', 'vnav', 'lnav'],
  },
  {
    hex: 'd00002',
    flight: 'TEST02',
    category: 'A3',
    squawk: '1724',
    x: 17,
    y: 22,
    alt: 9000,
    gs: 270,
    track: 210,
    baroRate: -1000,
    type: 'B738',
    reg: 'TEST-02',
    selAlt: 4000,
    selHeading: 210,
    modes: ['autopilot'],
  },
  {
    hex: 'd00003',
    flight: 'TEST03',
    category: 'A3',
    squawk: '2106',
    x: 5,
    y: 7,
    alt: 5000,
    gs: 220,
    track: 90,
    baroRate: 1500,
    type: 'B738',
    reg: 'TEST-03',
    selAlt: 7000,
    modes: ['autopilot', 'vnav', 'lnav'],
  },
  {
    hex: 'd00004',
    flight: 'TEST04',
    category: 'A3',
    squawk: '4421',
    x: -13,
    y: -26,
    alt: 8000,
    gs: 260,
    track: 25,
    baroRate: -800,
    type: 'B738',
    reg: 'TEST-04',
  },
  {
    hex: 'd00005',
    category: 'A1',
    squawk: '1200',
    x: -13,
    y: -11,
    alt: 2500,
    gs: 95,
    track: 0,
    baroRate: 0,
    mlat: true,
    type: 'C172',
    reg: 'TEST-05',
  },
  {
    hex: 'd00006',
    flight: 'TEST06',
    category: 'A3',
    squawk: '3452',
    x: 20,
    y: 19,
    alt: 14000,
    gs: 340,
    track: 255,
    baroRate: 0,
    type: 'A320',
    reg: 'TEST-06',
    selAlt: 14000,
    modes: ['autopilot', 'althold', 'lnav'],
  },
  {
    hex: 'd00007',
    flight: 'TEST07',
    category: 'A5',
    squawk: '5512',
    x: -8,
    y: 31,
    alt: 17000,
    gs: 380,
    track: 260,
    baroRate: 0,
    type: 'B74F',
    reg: 'TEST-07',
    selAlt: 21000,
    selHeading: 260,
    modes: ['autopilot', 'althold'],
  },
  {
    hex: 'd00008',
    flight: 'TEST08',
    category: 'A3',
    squawk: '7012',
    x: 32,
    y: 7,
    alt: 7500,
    gs: 240,
    track: 250,
    baroRate: -600,
    type: 'CRJ7',
    reg: 'TEST-08',
  },
  {
    hex: 'd00009',
    category: 'A2',
    squawk: '7700',
    x: -28,
    y: 10,
    alt: 9000,
    gs: 250,
    track: 95,
    baroRate: -1200,
    type: 'C68A',
    reg: 'TEST-09',
  },
  {
    hex: 'd0000a',
    flight: 'TEST10',
    category: 'A3',
    squawk: '2201',
    x: 0.6,
    y: -0.4,
    alt: 0,
    gs: 18,
    track: 340,
    baroRate: 0,
    ground: true,
    type: 'A321',
    reg: 'TEST-10',
  },
  {
    hex: 'd0000b',
    flight: 'TEST11',
    category: 'A5',
    squawk: '3112',
    x: -0.5,
    y: 0.3,
    alt: 0,
    gs: 6,
    track: 160,
    baroRate: 0,
    ground: true,
    type: 'B773',
    reg: 'TEST-11',
  },
];

/** Deterministic PRNG (mulberry32), so a load test sees the same traffic every run. */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` generic en-route targets spread over the sim area, for load testing. */
export function extraFleet(count: number, radiusNm = 50): SimAircraft[] {
  const rand = mulberry32(count);
  return Array.from({ length: count }, (_, i) => {
    const r = radiusNm * Math.sqrt(rand());
    const a = rand() * 2 * Math.PI;
    return {
      hex: (0xd10000 + i).toString(16),
      flight: `TEST${String(i).padStart(4, '0')}`,
      category: 'A3',
      squawk: (0o1000 + (i % 0o6000)).toString(8),
      x: r * Math.sin(a),
      y: r * Math.cos(a),
      alt: 1000 * Math.round(3 + rand() * 35),
      gs: Math.round(180 + rand() * 300),
      track: Math.round(rand() * 360),
      baroRate: 0,
      type: 'A320',
      reg: `TEST-${String(i).padStart(4, '0')}`,
    };
  });
}
