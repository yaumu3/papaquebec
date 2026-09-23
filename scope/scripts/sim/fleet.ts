/** The synthetic fleet: fictional targets that exercise every glyph, color and prefix. */
export interface SimAircraft {
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
  mlat?: boolean;
  type: string;
  reg: string;
}

/** A small fleet that exercises every color, glyph and prefix the scope draws. */
export const FLEET: SimAircraft[] = [
  {
    hex: '867a01',
    flight: 'ANA241',
    category: 'A3',
    squawk: '2431',
    x: 27,
    y: 16,
    alt: 11000,
    gs: 290,
    track: 235,
    baroRate: -1200,
    type: 'B789',
    reg: 'JA893A',
  },
  {
    hex: '867a02',
    flight: 'JAL317',
    category: 'A3',
    squawk: '1724',
    x: 17,
    y: 22,
    alt: 9000,
    gs: 270,
    track: 210,
    baroRate: -1000,
    type: 'B738',
    reg: 'JA348J',
  },
  {
    hex: '867a03',
    flight: 'JAL318',
    category: 'A3',
    squawk: '2106',
    x: 5,
    y: 7,
    alt: 5000,
    gs: 220,
    track: 90,
    baroRate: 1500,
    type: 'B738',
    reg: 'JA349J',
  },
  {
    hex: '867a04',
    flight: 'SKY013',
    category: 'A3',
    squawk: '4421',
    x: -13,
    y: -26,
    alt: 8000,
    gs: 260,
    track: 25,
    baroRate: -800,
    type: 'B738',
    reg: 'JA73NY',
  },
  {
    hex: '867a05',
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
    reg: 'JA4081',
  },
  {
    hex: '867a06',
    flight: 'SFJ72',
    category: 'A3',
    squawk: '3452',
    x: 20,
    y: 19,
    alt: 14000,
    gs: 340,
    track: 255,
    baroRate: 0,
    type: 'A320',
    reg: 'JA25MC',
  },
  {
    hex: '867a07',
    flight: 'NCA125',
    category: 'A5',
    squawk: '5512',
    x: -8,
    y: 31,
    alt: 17000,
    gs: 380,
    track: 260,
    baroRate: 0,
    type: 'B74F',
    reg: 'JA12KZ',
  },
  {
    hex: '867a08',
    flight: 'IBX012',
    category: 'A3',
    squawk: '7012',
    x: 32,
    y: 7,
    alt: 7500,
    gs: 240,
    track: 250,
    baroRate: -600,
    type: 'CRJ7',
    reg: 'JA10RJ',
  },
  {
    hex: '867a09',
    category: 'A2',
    squawk: '7700',
    x: -28,
    y: 10,
    alt: 9000,
    gs: 250,
    track: 95,
    baroRate: -1200,
    type: 'C68A',
    reg: 'JA00PQ',
  },
];
