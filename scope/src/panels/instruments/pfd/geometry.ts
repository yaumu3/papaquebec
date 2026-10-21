import { RAD } from '../../../lib/units';
import { fixed, type Point, polygonPath, tenth, type TextLabel, toward } from '../../svg';
import { instrumentHeight } from '../height';

const SPEED_LEFT_PX = 8;
const SPEED_RIGHT_PX = 54;
const WINDOW_LEFT_PX = 68;
const WINDOW_TOP_PX = 52;
const WINDOW_BOTTOM_INSET_PX = 36;
const TAPE_TOP_PX = 36;
const VSI_WIDTH_PX = 24;
const VSI_GAP_PX = 6;
const ALTITUDE_WIDTH_PX = 58;
const WINDOW_RIGHT_GAP_PX = 16;
const BANK_INSET_PX = 12;
const SELECTED_Y_PX = 24;
const FOOT_INSET_PX = 10;
const FMA_TOP_PX = 2;
const FMA_BOTTOM_PX = 20;
const FMA_COLUMNS = 3;

/** Where the display stands in its box: its columns, the attitude window and the centre line of its tapes. */
export interface PfdGeometry {
  w: number;
  h: number;
  /** The speed tape's left and right edges. */
  sL: number;
  sR: number;
  /** The attitude window's left and right edges, top, bottom and horizontal centre. */
  wx: number;
  wxr: number;
  wy: number;
  wyb: number;
  acx: number;
  /** The centre line of the window and of both tapes. */
  yc: number;
  /** Where the tapes begin and end, centred on the window. */
  yTop: number;
  yBot: number;
  /** The altitude tape's left and right edges, and the VSI's left edge. */
  aL: number;
  aR: number;
  vL: number;
  /** The radius of the bank scale. */
  rr: number;
  /** The centre line of the selected altitude's digits, and of the Mach and the BARO. */
  selY: number;
  footY: number;
}

/** The whole geometry of a display `w` wide: its height from the instruments' rule, the rest from both. */
export function pfdGeometry(w: number): PfdGeometry {
  const h = instrumentHeight(w);
  const vL = w - VSI_WIDTH_PX;
  const aR = vL - VSI_GAP_PX;
  const aL = aR - ALTITUDE_WIDTH_PX;
  const wxr = aL - WINDOW_RIGHT_GAP_PX;
  const wyb = h - WINDOW_BOTTOM_INSET_PX;
  const yc = (WINDOW_TOP_PX + wyb) / 2;
  return {
    w,
    h,
    sL: SPEED_LEFT_PX,
    sR: SPEED_RIGHT_PX,
    wx: WINDOW_LEFT_PX,
    wxr,
    wy: WINDOW_TOP_PX,
    wyb,
    acx: (WINDOW_LEFT_PX + wxr) / 2,
    yc,
    yTop: TAPE_TOP_PX,
    yBot: 2 * yc - TAPE_TOP_PX,
    aL,
    aR,
    vL,
    rr: yc - WINDOW_TOP_PX - BANK_INSET_PX,
    selY: SELECTED_Y_PX,
    footY: h - FOOT_INSET_PX,
  };
}

/** The rectangle from (x0, y0) to (x1, y1), as a closed path. */
const box = (x0: number, y0: number, x1: number, y1: number): string =>
  `M${fixed(x0)} ${fixed(y0)}H${fixed(x1)}V${fixed(y1)}H${fixed(x0)}Z`;

/** The strip behind the speed tape. */
export const speedStripPath = (g: PfdGeometry): string => box(g.sL, g.yTop, g.sR, g.yBot);

/** The strip behind the altitude tape. */
export const altitudeStripPath = (g: PfdGeometry): string => box(g.aL, g.yTop, g.aR, g.yBot);

/** The band of the flight mode annunciator across the attitude window's width. */
export const fmaBandPath = (g: PfdGeometry): string => box(g.wx, FMA_TOP_PX, g.wxr, FMA_BOTTOM_PX);

const fmaColumnWidth = (g: PfdGeometry): number => (g.wxr - g.wx) / FMA_COLUMNS;

/** The two rules that split the band into its columns. */
export function fmaRulesPath(g: PfdGeometry): string {
  return [1, 2]
    .map(
      (i) => `M${fixed(g.wx + i * fmaColumnWidth(g))} ${fixed(FMA_TOP_PX)}V${fixed(FMA_BOTTOM_PX)}`,
    )
    .join('');
}

/** The horizontal centre of each column of the band. */
export const fmaColumnX = (g: PfdGeometry): [number, number, number] => [
  g.wx + fmaColumnWidth(g) * 0.5,
  g.wx + fmaColumnWidth(g) * 1.5,
  g.wx + fmaColumnWidth(g) * 2.5,
];

/** The centre line of the band. */
export const FMA_CENTRE_Y = (FMA_TOP_PX + FMA_BOTTOM_PX) / 2;

const AP_RISE_PX = 10;

/** The centre line of the autopilot's label, just above the attitude window. */
export const apY = (g: PfdGeometry): number => g.wy - AP_RISE_PX;

/** Where `value` stands on a tape that shows `span` either side of `at` over its half-height. */
export const tapeY = (g: PfdGeometry, value: number, at: number, span: number): number =>
  g.yc - ((value - at) * (g.yc - g.yTop)) / span;

const SPEED_SPAN_KT = 45;
const SPEED_STEP_KT = 10;
const SPEED_LABEL_STEP_KT = 20;
const SPEED_TICK_PX = 8;
const SPEED_END_MARGIN_PX = 4;
const SPEED_LABEL_CLEAR_PX = 22;
const SPEED_LABEL_GAP_PX = 11;
/** How far past the visible span a tick is still worked out, so that none is missed at the ends. */
const SPEED_REACH_KT = 50;

export interface SpeedTape {
  ticks: string;
  labels: TextLabel[];
}

/** The ticks of the speed tape at the inner edge, every 10 kt, and its labels every 20 kt clear of the readout. */
export function speedTape(g: PfdGeometry, ias: number): SpeedTape {
  const out: SpeedTape = { ticks: '', labels: [] };
  const first = Math.max(0, Math.ceil((ias - SPEED_REACH_KT) / SPEED_STEP_KT) * SPEED_STEP_KT);
  for (let v = first; v <= ias + SPEED_REACH_KT; v += SPEED_STEP_KT) {
    const y = tapeY(g, v, ias, SPEED_SPAN_KT);
    if (y < g.yTop + SPEED_END_MARGIN_PX || y > g.yBot - SPEED_END_MARGIN_PX) continue;
    out.ticks += `M${fixed(g.sR)} ${fixed(y)}h${-SPEED_TICK_PX}`;
    if (v % SPEED_LABEL_STEP_KT === 0 && Math.abs(y - g.yc) > SPEED_LABEL_CLEAR_PX) {
      out.labels.push({ text: String(v), x: g.sR - SPEED_LABEL_GAP_PX, y: tenth(y) });
    }
  }
  return out;
}

const SPEED_BOX_OUT_PX = 4;
const SPEED_BOX_IN_PX = 14;
const READOUT_HALF_HEIGHT_PX = 18;

/**
 * A digit wheel of a readout: its rows top to bottom, and how far it has turned toward the row
 * above the one at rest.
 */
export interface Wheel<T = string> {
  rows: readonly T[];
  /** From 0, at rest, up to but not including 1, the next row fully in. */
  turned: number;
}

/**
 * The fraction of its last `step` before the next multiple of `place` that `a` has run: how far a
 * carry wheel has turned.
 */
const carried = (a: number, place: number, step: number): number =>
  Math.max(0, (a % place) - (place - step)) / step;

/** Where a wheel's window stands, and how its column is laid out in it. */
export interface WheelCell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The height of a row, and the number of rows above the one at rest. */
  lineH: number;
  above: number;
  /** The font size of the rows, and the top of the resting row inside the window. */
  px: number;
  restTop: number;
}

/**
 * The top of a wheel's column in its window: the resting row in place, moved down by `turned` of a
 * row.
 */
export const columnTop = (cell: WheelCell, turned: number): number =>
  cell.restTop - cell.above * cell.lineH + turned * cell.lineH;

/**
 * A digit wheel of `place`, rolling from this digit to the next through the last `step` before it.
 */
const carryWheel = <T>(a: number, place: number, step: number, rows: [T, T]): Wheel<T> => ({
  rows,
  turned: carried(a, place, step),
});

/** JetBrains Mono: advance 600, ascender 1020, descender 300 of 1000 units per em. */
const MONO_ADVANCE_EM = 0.6;
/**
 * How far the baseline sits below the middle of a line box, whatever its line height:
 * (1020 − 300) / 2 / 1000. The baseline's depth in a box as tall as its font is 0.5 plus this.
 */
export const MONO_MID_TO_BASELINE_EM = 0.36;
/** JetBrains Mono's cap height, 730 of 1000 units per em. */
export const MONO_CAP_EM = 0.73;

/** The readout box's inner half height: the box's half height less its 1 px stroke. */
const INNER_HALF_PX = READOUT_HALF_HEIGHT_PX - 1;
/** The window of a drum, and of a carry wheel: the box's inner height. */
const DRUM_WINDOW_H_PX = 2 * INNER_HALF_PX;
/** A pitch is rounded up to this, so that rows land on the browser's layout grid. */
const LAYOUT_STEP_PX = 0.25;

/** The baseline's depth below `yc` for a readout line of `linePx`. */
const baselineDepth = (linePx: number): number => MONO_MID_TO_BASELINE_EM * linePx;

/**
 * The row pitch of a readout's carry wheels, whose windows are the box's inner height. At rest the
 * next row's baseline waits at or above the inner top edge, and when a carry ends the old row's
 * cap top has cleared the inner bottom edge.
 */
export const carryPitch = (linePx: number): number => {
  const depth = baselineDepth(linePx);
  const clear = Math.max(INNER_HALF_PX + depth, INNER_HALF_PX + MONO_CAP_EM * linePx - depth);
  return Math.ceil(clear / LAYOUT_STEP_PX) * LAYOUT_STEP_PX;
};

/**
 * The window of a carry wheel's digit of `px` ending at `edge`, on the baseline of a readout line
 * of `linePx` centred on `yc`: the box's inner height, the resting row put by its baseline.
 */
const carryCell = (yc: number, linePx: number, edge: number, px: number): WheelCell => {
  const pitch = carryPitch(linePx);
  return {
    x: edge - MONO_ADVANCE_EM * px,
    y: yc - INNER_HALF_PX,
    w: MONO_ADVANCE_EM * px,
    h: DRUM_WINDOW_H_PX,
    lineH: pitch,
    above: 1,
    px,
    restTop: INNER_HALF_PX + baselineDepth(linePx) - pitch / 2 - MONO_MID_TO_BASELINE_EM * px,
  };
};

const SPIKE_PX = 5;

/** The speed readout: a box inset from the tape's edge, with a spike to the right at the centre line. */
export function speedBoxPath(g: PfdGeometry): string {
  const left = g.sL - SPEED_BOX_OUT_PX;
  const right = g.sR - SPEED_BOX_IN_PX;
  const { yc } = g;
  const top = yc - READOUT_HALF_HEIGHT_PX;
  const bottom = yc + READOUT_HALF_HEIGHT_PX;
  return (
    `M${fixed(left)} ${fixed(top)}H${fixed(right)}V${fixed(yc - SPIKE_PX)}` +
    `L${fixed(right + SPIKE_PX)} ${fixed(yc)}L${fixed(right)} ${fixed(yc + SPIKE_PX)}` +
    `V${fixed(bottom)}H${fixed(left)}Z`
  );
}

export interface SpeedDigits {
  hundreds: Wheel;
  tens: Wheel;
  /** The ones, rows base + 2 down to base − 1 kt. */
  ones: Wheel;
}

const TEN_KT = 10;
const HUNDRED_KT = 100;

const oneDigit = (n: number): string => String(((n % 10) + 10) % 10);

/** The speed as wheels: each digit rolls through the last knot before it changes. */
export function speedDigits(ias: number): SpeedDigits {
  const base = Math.floor(ias);
  const hundreds = Math.floor(ias / HUNDRED_KT);
  const tens = Math.floor(ias / TEN_KT);
  return {
    hundreds: carryWheel(ias, HUNDRED_KT, 1, [
      String(hundreds + 1),
      hundreds === 0 ? '' : String(hundreds),
    ]),
    tens: carryWheel(ias, TEN_KT, 1, [oneDigit(tens + 1), oneDigit(tens)]),
    ones: {
      rows: [2, 1, 0, -1].map((k) => (base + k < 0 ? '' : oneDigit(base + k))),
      turned: ias - base,
    },
  };
}

const SPEED_DIGIT_PX = 16;
const SPEED_DRUM_GAP_PX = 12;
const SPEED_DRUM_LINE_PX = 18;

interface SpeedReadout {
  /** The tape's centre, where its flag and its Mach stand. */
  midX: number;
  hundreds: WheelCell;
  tens: WheelCell;
  /** The window the ones drum is clipped to. */
  ones: WheelCell;
}

/** Where the speed readout's wheels stand. */
export function speedReadout(g: PfdGeometry): SpeedReadout {
  const right = g.sR - SPEED_BOX_IN_PX;
  const hiX = right - SPEED_DRUM_GAP_PX;
  const carry = (edge: number) => carryCell(g.yc, SPEED_DIGIT_PX, edge, SPEED_DIGIT_PX);
  const tens = carry(hiX);
  return {
    midX: (g.sL + g.sR) / 2,
    hundreds: carry(tens.x),
    tens,
    ones: {
      x: hiX + 1,
      y: g.yc - INNER_HALF_PX,
      w: right - hiX - 2,
      h: DRUM_WINDOW_H_PX,
      lineH: SPEED_DRUM_LINE_PX,
      above: 2,
      px: SPEED_DIGIT_PX,
      restTop: INNER_HALF_PX - SPEED_DRUM_LINE_PX / 2,
    },
  };
}

const PITCH_PX_PER_DEG = 3.6;
const LADDER_STEP_DEG = 2.5;
const LADDER_SPAN_DEG = 20;
const LADDER_TOP_MARGIN_PX = 16;
const LADDER_BOTTOM_MARGIN_PX = 4;
const LADDER_LABEL_GAP_PX = 9;

/** The half-length of a rung of the ladder: longer at each 5° and each 10°. */
const rungHalfLength = (deg: number): number => (deg % 10 === 0 ? 28 : deg % 5 === 0 ? 14 : 7);

export interface Attitude {
  /** The two parts of the window the horizon divides, as closed paths. */
  sky: string;
  ground: string;
  horizon: string;
  ladder: string;
  labels: TextLabel[];
  /** The roll pointer, a triangle on the bank scale. */
  pointer: string;
}

/** The parts of a polygon on one side of a line, with the points where the line cuts it. */
function clipSide(
  polygon: readonly Point[],
  distance: (p: Point) => number,
  keepSky: boolean,
): { path: string; cuts: Point[] } {
  const inside = (d: number) => (keepSky ? d >= 0 : d < 0);
  const points: Point[] = [];
  const cuts: Point[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if (!b) return;
    const da = distance(a);
    const db = distance(b);
    if (inside(da)) points.push(a);
    if (inside(da) === inside(db)) return;
    const k = da / (da - db);
    const cut: Point = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    points.push(cut);
    if (keepSky) cuts.push(cut);
  });
  return { path: points.length ? polygonPath(points) : '', cuts };
}

/** The directions along the horizon and up from it, in window coordinates, at `rollDeg` of roll. */
function rolledFrame(rollDeg: number): { along: Point; up: Point } {
  const r = rollDeg * RAD;
  return { along: [Math.cos(r), -Math.sin(r)], up: [-Math.sin(r), -Math.cos(r)] };
}

/**
 * The attitude window at `rollDeg` of roll. Pitch is not broadcast, so the horizon always passes
 * through the window's centre, perpendicular to the rolled up-vector.
 */
export function attitude(g: PfdGeometry, rollDeg: number): Attitude {
  const { along, up } = rolledFrame(rollDeg);
  const corners: Point[] = [
    [g.wx, g.wy],
    [g.wxr, g.wy],
    [g.wxr, g.wyb],
    [g.wx, g.wyb],
  ];
  const height = ([x, y]: Point) => (x - g.acx) * up[0] + (y - g.yc) * up[1];
  const sky = clipSide(corners, height, true);
  const ground = clipSide(corners, height, false);
  const [from, to] = sky.cuts;
  let ladder = '';
  const labels: TextLabel[] = [];
  for (let deg = -LADDER_SPAN_DEG; deg <= LADDER_SPAN_DEG; deg += LADDER_STEP_DEG) {
    const off = deg * PITCH_PX_PER_DEG;
    if (deg === 0 || off > g.rr - LADDER_TOP_MARGIN_PX) continue;
    if (-off > g.wyb - g.yc - LADDER_BOTTOM_MARGIN_PX) continue;
    const half = rungHalfLength(deg);
    const cx = g.acx + off * up[0];
    const cy = g.yc + off * up[1];
    ladder += `M${fixed(cx - half * along[0])} ${fixed(cy - half * along[1])}L${fixed(cx + half * along[0])} ${fixed(cy + half * along[1])}`;
    if (deg % 10 !== 0) continue;
    for (const side of [-1, 1]) {
      const reach = side * (half + LADDER_LABEL_GAP_PX);
      labels.push({
        text: String(Math.abs(deg)),
        x: tenth(cx + reach * along[0]),
        y: tenth(cy + reach * along[1]),
      });
    }
  }
  return {
    sky: sky.path,
    ground: ground.path,
    horizon:
      from && to ? `M${fixed(from[0])} ${fixed(from[1])}L${fixed(to[0])} ${fixed(to[1])}` : '',
    ladder,
    labels,
    pointer: pointerPath(g, -rollDeg),
  };
}

/** The point at `radius` from the scale's centre, `deg` clockwise of the top. */
const onScale = (g: PfdGeometry, deg: number, radius: number): string =>
  toward(g.acx, g.yc, deg)(radius);

const POINTER_TIP_INSET_PX = 2;
const POINTER_BASE_INSET_PX = 12;
const POINTER_HALF_WIDTH_DEG = 5;

const pointerPath = (g: PfdGeometry, deg: number): string =>
  `M${onScale(g, deg, g.rr - POINTER_TIP_INSET_PX)}` +
  `L${onScale(g, deg - POINTER_HALF_WIDTH_DEG, g.rr - POINTER_BASE_INSET_PX)}` +
  `L${onScale(g, deg + POINTER_HALF_WIDTH_DEG, g.rr - POINTER_BASE_INSET_PX)}Z`;

const BANK_MARKS_DEG: readonly number[] = [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60];
const BANK_LONG_TICK_PX = 11;
const BANK_SHORT_TICK_PX = 6;

/** The ticks of the bank scale, longer at 30° and 60°. */
export const bankScalePath = (g: PfdGeometry): string =>
  BANK_MARKS_DEG.map((deg) => {
    const long = Math.abs(deg) % 30 === 0;
    return `M${onScale(g, deg, g.rr)}L${onScale(g, deg, g.rr + (long ? BANK_LONG_TICK_PX : BANK_SHORT_TICK_PX))}`;
  }).join('');

const INDEX_HALF_WIDTH_PX = 6;
const INDEX_HEIGHT_PX = 9;

/** The fixed index at the top of the bank scale, a filled triangle. */
export const bankIndexPath = (g: PfdGeometry): string =>
  `M${fixed(g.acx)} ${fixed(g.yc - g.rr)}l${-INDEX_HALF_WIDTH_PX} ${-INDEX_HEIGHT_PX}h${2 * INDEX_HALF_WIDTH_PX}Z`;

const WINDOW_RADIUS_PX = 12;

/** The attitude window as the attributes of an SVG rectangle. */
export const windowRect = (g: PfdGeometry) => ({
  x: g.wx,
  y: g.wy,
  width: g.wxr - g.wx,
  height: g.wyb - g.wy,
  rx: WINDOW_RADIUS_PX,
});

/** The flight path vector's angles: its climb, and the drift of the track off the heading. */
export interface Fpv {
  fpaDeg: number;
  driftDeg: number;
}

const FPV_LEFT_PX = 18;
const FPV_UP_PX = 12;
const FPV_DOWN_PX = 5;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Where the flight path vector stands, in the rolled frame at the ladder's scale, kept whole
 * inside the window.
 */
export function fpvAt(g: PfdGeometry, rollDeg: number, fpv: Fpv): [number, number] {
  const { along, up } = rolledFrame(rollDeg);
  const climb = fpv.fpaDeg * PITCH_PX_PER_DEG;
  const drift = fpv.driftDeg * PITCH_PX_PER_DEG;
  const x = g.acx + climb * up[0] + drift * along[0];
  const y = g.yc + climb * up[1] + drift * along[1];
  return [
    clamp(x, g.wx + FPV_LEFT_PX, g.wxr - FPV_LEFT_PX),
    clamp(y, g.wy + FPV_UP_PX, g.wyb - FPV_DOWN_PX),
  ];
}

const FPV_RADIUS_PX = 5;
const FPV_WING_PX = 13;
const FPV_FIN_PX = 7;

/** The circle with two wings and a fin, upright, at (x, y). */
export function fpvPath([x, y]: readonly [number, number]): string {
  const left = `${fixed(x - FPV_RADIUS_PX)} ${fixed(y)}`;
  const right = `${fixed(x + FPV_RADIUS_PX)} ${fixed(y)}`;
  const arc = `A${fixed(FPV_RADIUS_PX)} ${fixed(FPV_RADIUS_PX)} 0 1 0`;
  return (
    `M${left}${arc} ${right}${arc} ${left}` +
    `M${left}h${-FPV_WING_PX}M${right}h${FPV_WING_PX}` +
    `M${fixed(x)} ${fixed(y - FPV_RADIUS_PX)}v${-FPV_FIN_PX}`
  );
}

const ALTITUDE_SPAN_FT = 450;
const ALTITUDE_STEP_FT = 100;
const ALTITUDE_LABEL_STEP_FT = 200;
const ALTITUDE_THOUSAND_FT = 1000;
const ALTITUDE_REACH_FT = 600;
const ALTITUDE_END_MARGIN_PX = 3;
const ALTITUDE_LABEL_CLEAR_PX = 24;
const ALTITUDE_LABEL_TICK_PX = 9;
const ALTITUDE_TICK_PX = 5;
const ALTITUDE_LABEL_GAP_PX = 13;
const BAR_FROM_PX = 11;
const BAR_TO_INSET_PX = 2;
const BAR_OFF_PX = 9;
const MINUS = '−';

/** The thousands of an altitude, with the minus sign of a negative one before them. */
const signedThousands = (ft: number): string =>
  `${ft < 0 ? MINUS : ''}${Math.floor(Math.abs(ft) / ALTITUDE_THOUSAND_FT)}`;

interface AltitudeLabel {
  /** The thousands, large, and the hundreds, in three small digits. */
  hi: string;
  lo: string;
  x: number;
  y: number;
}

export interface AltitudeTape {
  ticks: string;
  /** The lines above and below each labelled thousand. */
  bars: string;
  labels: AltitudeLabel[];
}

/** The ticks on the altitude tape's inner edge every 100 ft, its labels every 200 ft and its bars. */
export function altitudeTape(g: PfdGeometry, ft: number): AltitudeTape {
  const out: AltitudeTape = { ticks: '', bars: '', labels: [] };
  const first = Math.ceil((ft - ALTITUDE_REACH_FT) / ALTITUDE_STEP_FT) * ALTITUDE_STEP_FT;
  for (let a = first; a <= ft + ALTITUDE_REACH_FT; a += ALTITUDE_STEP_FT) {
    const y = tapeY(g, a, ft, ALTITUDE_SPAN_FT);
    if (y < g.yTop + ALTITUDE_END_MARGIN_PX || y > g.yBot - ALTITUDE_END_MARGIN_PX) continue;
    const labelled = a % ALTITUDE_LABEL_STEP_FT === 0;
    out.ticks += `M${fixed(g.aL)} ${fixed(y)}h${labelled ? ALTITUDE_LABEL_TICK_PX : ALTITUDE_TICK_PX}`;
    if (!labelled || Math.abs(y - g.yc) <= ALTITUDE_LABEL_CLEAR_PX) continue;
    const hundreds = String(Math.abs(a) % ALTITUDE_THOUSAND_FT).padStart(3, '0');
    out.labels.push({
      hi: signedThousands(a),
      lo: hundreds,
      x: g.aL + ALTITUDE_LABEL_GAP_PX,
      y: tenth(y),
    });
    if (a % ALTITUDE_THOUSAND_FT !== 0) continue;
    const bar = (at: number) =>
      at < g.yTop || at > g.yBot
        ? ''
        : `M${fixed(g.aL + BAR_FROM_PX)} ${fixed(at)}H${fixed(g.aR - BAR_TO_INSET_PX)}`;
    out.bars += bar(y - BAR_OFF_PX) + bar(y + BAR_OFF_PX);
  }
  return out;
}

const ALTITUDE_BOX_IN_PX = 15;
const ALTITUDE_BOX_OUT_PX = 5;

/** The altitude readout: a box inset from the tape's edge, with a spike to the left at the centre line. */
export function altitudeBoxPath(g: PfdGeometry): string {
  const left = g.aL + ALTITUDE_BOX_IN_PX;
  const right = g.aR + ALTITUDE_BOX_OUT_PX;
  const { yc } = g;
  return (
    `M${fixed(left)} ${fixed(yc - READOUT_HALF_HEIGHT_PX)}H${fixed(right)}` +
    `V${fixed(yc + READOUT_HALF_HEIGHT_PX)}H${fixed(left)}V${fixed(yc + SPIKE_PX)}` +
    `L${fixed(left - SPIKE_PX)} ${fixed(yc)}L${fixed(left)} ${fixed(yc - SPIKE_PX)}Z`
  );
}

/** What the slot of the ten-thousands shows: a digit, a hatch below 10,000 ft, NEG below zero. */
export type SlotRow = { kind: 'digit'; text: string } | { kind: 'hatch' } | { kind: 'neg' };

export interface AltitudeDigits {
  tenThousands: Wheel<SlotRow>;
  thousands: Wheel;
  hundreds: Wheel;
  /** The last two digits, rows base + 40 down to base − 20 ft. */
  drum: Wheel;
}

const DRUM_STEP_FT = 20;
const HUNDRED_FT = 100;
const TEN_THOUSAND_FT = 10000;

/** The last two digits of a non-negative number. */
const twoDigits = (n: number): string => String(n % 100).padStart(2, '0');

const slotDigit = (n: number): SlotRow => ({ kind: 'digit', text: String(n) });

/** The slot's row at rest: NEG below zero, a hatch under 10,000 ft, else the ten-thousands digit. */
function slotRow(ft: number): SlotRow {
  if (ft < 0) return { kind: 'neg' };
  return ft < TEN_THOUSAND_FT ? { kind: 'hatch' } : slotDigit(Math.floor(ft / TEN_THOUSAND_FT));
}

const digitAt = (a: number, place: number, next = 0): string =>
  String((Math.floor(a / place) + next) % 10);

/**
 * The digits of an altitude as wheels, the absolute value laid out as usual after a sign. Each
 * digit rolls through the last 20 ft before it changes, and the drum stands at the exact place
 * within its 20 ft step.
 */
export function altitudeDigits(ft: number): AltitudeDigits {
  const a = Math.abs(ft);
  const base = Math.floor(a / DRUM_STEP_FT) * DRUM_STEP_FT;
  return {
    tenThousands: carryWheel(a, TEN_THOUSAND_FT, DRUM_STEP_FT, [
      slotDigit(Math.floor(a / TEN_THOUSAND_FT) + 1),
      slotRow(ft),
    ]),
    thousands: carryWheel(a, ALTITUDE_THOUSAND_FT, DRUM_STEP_FT, [
      digitAt(a, ALTITUDE_THOUSAND_FT, 1),
      digitAt(a, ALTITUDE_THOUSAND_FT),
    ]),
    hundreds: carryWheel(a, HUNDRED_FT, DRUM_STEP_FT, [
      digitAt(a, HUNDRED_FT, 1),
      digitAt(a, HUNDRED_FT),
    ]),
    drum: {
      rows: [2, 1, 0, -1].map((k) => twoDigits(Math.abs(base + k * DRUM_STEP_FT))),
      turned: (a - base) / DRUM_STEP_FT,
    },
  };
}

export const ALTITUDE_THOUSANDS_PX = 17;
const ALTITUDE_HUNDREDS_PX = 13;
const ALTITUDE_DIGITS_GAP_PX = 18;
const ALTITUDE_DRUM_GAP_PX = 17;
const ALTITUDE_DRUM_LINE_PX = 17;

/**
 * The stripes of the hatch, measured on a Boeing PFD: their horizontal pitch as a part of the cap
 * height, how steeply they fall (down per across), and how much of each period is ink (4.5 of
 * 5.75 px in the reference, a step lighter at the user's word, kept to at least 1 device px of gap
 * at a pixel ratio of 2).
 */
const HATCH_PITCH_CAP = 0.185;
const HATCH_SLOPE = 2;
const HATCH_INK = 0.68;
/** The hatch block's width as a part of the digit advance. */
const HATCH_WIDTH_ADVANCE = 0.85;

interface HatchStyle {
  /** Where the block starts in its cell, and how wide it is. */
  left: number;
  width: number;
  /** The stripes: drawn `ink` of each `pitch` across them, turned `angle` degrees clockwise. */
  pitch: number;
  ink: number;
  angle: number;
}

/** The hatch for a digit cell of `px`: centred, cap-high stripes falling to the right. */
export function hatchStyle(px: number): HatchStyle {
  const advance = MONO_ADVANCE_EM * px;
  const width = HATCH_WIDTH_ADVANCE * advance;
  const pitch = HATCH_PITCH_CAP * MONO_CAP_EM * px * Math.sin(Math.atan(HATCH_SLOPE));
  return {
    left: (advance - width) / 2,
    width,
    pitch,
    ink: HATCH_INK * pitch,
    angle: -Math.atan(1 / HATCH_SLOPE) / RAD,
  };
}

interface AltitudeReadout {
  /** The middle of the tape, where its flag stands. */
  tapeX: number;
  /** The middle of the box, where GND stands. */
  midX: number;
  tenThousands: WheelCell;
  thousands: WheelCell;
  hundreds: WheelCell;
  drum: WheelCell;
  /** The middle of the cap height of the slot's digit, where NEG is centred. */
  neg: { x: number; y: number };
}

/** Where the altitude readout's wheels stand. */
export function altitudeReadout(g: PfdGeometry): AltitudeReadout {
  const left = g.aL + ALTITUDE_BOX_IN_PX;
  const right = g.aR + ALTITUDE_BOX_OUT_PX;
  const drumX = right - ALTITUDE_DRUM_GAP_PX;
  const digit = (edge: number, px: number) => carryCell(g.yc, ALTITUDE_THOUSANDS_PX, edge, px);
  const hundreds = digit(right - ALTITUDE_DIGITS_GAP_PX, ALTITUDE_HUNDREDS_PX);
  const thousands = digit(hundreds.x, ALTITUDE_THOUSANDS_PX);
  const slot = digit(thousands.x, ALTITUDE_THOUSANDS_PX);
  return {
    tapeX: (g.aL + g.aR) / 2,
    midX: (left + right) / 2,
    tenThousands: slot,
    thousands,
    hundreds,
    drum: {
      x: drumX,
      y: g.yc - INNER_HALF_PX,
      w: right - drumX - 1,
      h: DRUM_WINDOW_H_PX,
      lineH: ALTITUDE_DRUM_LINE_PX,
      above: 2,
      px: ALTITUDE_HUNDREDS_PX,
      restTop: INNER_HALF_PX - ALTITUDE_DRUM_LINE_PX / 2,
    },
    neg: {
      x: slot.x + slot.w / 2,
      y: g.yc + baselineDepth(ALTITUDE_THOUSANDS_PX) - (MONO_CAP_EM * ALTITUDE_THOUSANDS_PX) / 2,
    },
  };
}

/** The digits of a selected altitude: its thousands and its last three digits. */
export function selDigits(sel: number): { hi: string; lo: string } {
  return {
    hi: String(Math.floor(sel / ALTITUDE_THOUSAND_FT)),
    lo: String(sel % ALTITUDE_THOUSAND_FT).padStart(3, '0'),
  };
}

const BUG_OUT_PX = 9;
const BUG_IN_PX = 17;
const BUG_HALF_HEIGHT_PX = 20;
const BUG_NOTCH_PX = 6;

/**
 * The selected-altitude bug: it straddles the tape's left edge, taller than the readout, with a
 * notch facing out. Off the scale it parks with its centre on the tape's end.
 */
export function selBugPath(g: PfdGeometry, ft: number, sel: number): string {
  const y = clamp(tapeY(g, sel, ft, ALTITUDE_SPAN_FT), g.yTop, g.yBot);
  const left = g.aL - BUG_OUT_PX;
  const right = g.aL + BUG_IN_PX;
  const half = BUG_HALF_HEIGHT_PX;
  return (
    `M${fixed(left)} ${fixed(y - half)}H${fixed(right)}V${fixed(y + half)}H${fixed(left)}` +
    `V${fixed(y + BUG_NOTCH_PX)}L${fixed(left + BUG_NOTCH_PX)} ${fixed(y)}` +
    `L${fixed(left)} ${fixed(y - BUG_NOTCH_PX)}Z`
  );
}

const BUG_CLIP_LEFT_PX = 12;
const BUG_CLIP_RIGHT_PX = 4;

/** The rectangle the bug is clipped to: the tape's rows, and its width with the bug's overhang. */
export const selClipRect = (g: PfdGeometry) => ({
  x: g.aL - BUG_CLIP_LEFT_PX,
  y: g.yTop,
  width: g.aR - g.aL + BUG_CLIP_LEFT_PX + BUG_CLIP_RIGHT_PX,
  height: g.yBot - g.yTop,
});

/** The dotted line across the tape at the FMS altitude; none when it is off the tape. */
export function fmsLinePath(g: PfdGeometry, ft: number, fms: number): string | undefined {
  const y = tapeY(g, fms, ft, ALTITUDE_SPAN_FT);
  if (y < g.yTop || y > g.yBot) return undefined;
  return `M${fixed(g.aL)} ${fixed(y)}H${fixed(g.aR)}`;
}

const VSI_RANGE_FPM = 6000;
const VSI_HALF_MARGIN_PX = 14;
const VSI_SCALE_UNITS = 80;
/** The scale's slope, in units per fpm, up to 1000, up to 2000 and beyond, and where each starts. */
const VSI_SLOPES: readonly (readonly [number, number, number])[] = [
  [0, 0, 0.03],
  [1000, 30, 0.022],
  [2000, 52, 0.007],
];

/** The half-height of the vertical speed scale, on the tape's rows less a margin. */
const vsiHalf = (g: PfdGeometry): number => g.yc - g.yTop - VSI_HALF_MARGIN_PX;

/** How far a vertical rate stands from the centre line, up for a climb; the scale is nonlinear and capped. */
export function vsiOffset(g: PfdGeometry, vsFpm: number): number {
  const v = Math.min(Math.abs(vsFpm), VSI_RANGE_FPM);
  const [from, base, slope] = VSI_SLOPES.findLast(([start]) => v >= start) ?? [0, 0, 0];
  return Math.sign(vsFpm) * (vsiHalf(g) / VSI_SCALE_UNITS) * (base + (v - from) * slope);
}

/** Where a vertical rate stands on the scale. */
export const vsiY = (g: PfdGeometry, vsFpm: number): number => g.yc - vsiOffset(g, vsFpm);

const VSI_CHAMFER_IN_PX = 10;
const VSI_CHAMFER_SHORT_PX = 8;
const VSI_CHAMFER_LONG_PX = 14;
const VSI_RIGHT_INSET_PX = 1;

/** The strip behind the scale, its outer corners chamfered. */
export function vsiStripPath(g: PfdGeometry): string {
  const half = vsiHalf(g);
  const right = g.w - VSI_RIGHT_INSET_PX;
  const bend = g.w - VSI_CHAMFER_IN_PX;
  return (
    `M${fixed(g.vL)} ${fixed(g.yc - half - VSI_CHAMFER_SHORT_PX)}H${fixed(bend)}` +
    `L${fixed(right)} ${fixed(g.yc - half + VSI_CHAMFER_LONG_PX)}V${fixed(g.yc + half - VSI_CHAMFER_LONG_PX)}` +
    `L${fixed(bend)} ${fixed(g.yc + half + VSI_CHAMFER_SHORT_PX)}H${fixed(g.vL)}Z`
  );
}

const VSI_MARKS_FPM: readonly number[] = [500, 1000, 1500, 2000, 4000, 6000];
const VSI_LABELLED_FPM: ReadonlySet<number> = new Set([1000, 2000, 6000]);
const VSI_TICKS_FROM_PX = 10;
const VSI_ZERO_PX = 7;
const VSI_LONG_TICK_PX = 5;
const VSI_SHORT_TICK_PX = 3;
const VSI_LABEL_GAP_PX = 2;

export interface VsiScale {
  ticks: string;
  labels: TextLabel[];
}

/** The zero mark, the ticks at ±500 to ±6000 fpm and the labels of thousands, 1, 2 and 6. */
export function vsiScale(g: PfdGeometry): VsiScale {
  const x = g.vL + VSI_TICKS_FROM_PX;
  const out: VsiScale = { ticks: `M${fixed(x)} ${fixed(g.yc)}h${VSI_ZERO_PX}`, labels: [] };
  for (const mark of VSI_MARKS_FPM) {
    const labelled = VSI_LABELLED_FPM.has(mark);
    for (const v of [mark, -mark]) {
      const y = vsiY(g, v);
      out.ticks += `M${fixed(x)} ${fixed(y)}h${labelled ? VSI_LONG_TICK_PX : VSI_SHORT_TICK_PX}`;
      if (labelled) {
        out.labels.push({ text: String(mark / 1000), x: g.vL + VSI_LABEL_GAP_PX, y: tenth(y) });
      }
    }
  }
  return out;
}

const VSI_NEEDLE_TIP_PX = 2;
const VSI_PIVOT_PX = 70;
const VSI_NEEDLE_CUT_PX = 3;

/** The needle, from the scale towards a pivot off the right edge at the centre line, cut short of the edge. */
export function vsiNeedlePath(g: PfdGeometry, vsFpm: number): string {
  const tipX = g.vL + VSI_TICKS_FROM_PX + VSI_NEEDLE_TIP_PX;
  const tipY = vsiY(g, vsFpm);
  const pivotX = g.w + VSI_PIVOT_PX;
  const k = (g.w - VSI_NEEDLE_CUT_PX - tipX) / (pivotX - tipX);
  const endY = tipY + (g.yc - tipY) * k;
  return `M${fixed(tipX)} ${fixed(tipY)}L${fixed(g.w - VSI_NEEDLE_CUT_PX)} ${fixed(endY)}`;
}

const VSI_DIGITS_FROM_FPM = 400;
const VSI_DIGITS_STEP_FPM = 50;
const VSI_DIGITS_RISE_PX = 18;
const VSI_DIGITS_RIGHT_INSET_PX = 2;

/** The rate to 50 fpm from 400, right-aligned above the strip for a climb and below it for a descent. */
export function vsiDigits(g: PfdGeometry, vsFpm: number): TextLabel | undefined {
  if (Math.abs(vsFpm) < VSI_DIGITS_FROM_FPM) return undefined;
  const rounded = Math.abs(Math.round(vsFpm / VSI_DIGITS_STEP_FPM) * VSI_DIGITS_STEP_FPM);
  const reach = vsiHalf(g) + VSI_DIGITS_RISE_PX;
  return {
    text: String(rounded),
    x: g.w - VSI_DIGITS_RIGHT_INSET_PX,
    y: vsFpm > 0 ? g.yc - reach : g.yc + reach,
  };
}
