import type { AtlasInfo } from '../protocol';
import { edt, INF } from './edt';

/** Printable ASCII plus the few symbols the scope draws. */
const ATLAS_CHARS = `${Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')}↑↓°·×–—`;

const COLUMNS = 16;
const RADIUS_FRACTION = 1 / 6;
/** Where the glyph edge lands in the encoded byte range: 255 * (1 - CUTOFF). */
const CUTOFF = 0.25;

export interface Atlas {
  info: AtlasInfo;
  pixels: Uint8Array;
}

function fontSpec(weight: number, sizePx: number, family: string): string {
  return `${weight} ${sizePx}px "${family}", ui-monospace, Menlo, monospace`;
}

/**
 * Rasterise the glyph set with Canvas 2D and encode a signed distance field
 * per cell (tiny-sdf style). Runs on the main thread once, at start-up; the
 * bytes go to the render worker as a texture.
 */
export async function buildAtlas(
  family = 'JetBrains Mono',
  weight = 500,
  fontSize = 48,
): Promise<Atlas> {
  const font = fontSpec(weight, fontSize, family);
  await document.fonts.load(font, 'Mg');
  const buffer = Math.ceil(fontSize * RADIUS_FRACTION);
  const radius = buffer;
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('Canvas 2D unavailable');
  measure.font = font;
  const m = measure.measureText('M');
  const advance = m.width;
  const ascent = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent * 1.15;
  const descent = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent * 1.5;
  const cellW = Math.ceil(advance + 2 * buffer);
  const cellH = Math.ceil(ascent + descent + 2 * buffer);
  const baseline = buffer + Math.round(ascent);
  const chars = Array.from(ATLAS_CHARS);
  const rows = Math.ceil(chars.length / COLUMNS);
  const width = COLUMNS * cellW;
  const height = rows * cellH;
  const pixels = new Uint8Array(width * height);

  const cell = document.createElement('canvas');
  cell.width = cellW;
  cell.height = cellH;
  const ctx = cell.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';

  const outer = new Float64Array(cellW * cellH);
  const inner = new Float64Array(cellW * cellH);
  chars.forEach((c, i) => {
    ctx.clearRect(0, 0, cellW, cellH);
    ctx.fillText(c, buffer, baseline);
    const { data } = ctx.getImageData(0, 0, cellW, cellH);
    for (let p = 0; p < cellW * cellH; p++) {
      const a = (data[p * 4 + 3] ?? 0) / 255;
      if (a === 1) {
        outer[p] = 0;
        inner[p] = INF;
      } else if (a === 0) {
        outer[p] = INF;
        inner[p] = 0;
      } else {
        const d = 0.5 - a;
        outer[p] = d > 0 ? d * d : 0;
        inner[p] = d < 0 ? d * d : 0;
      }
    }
    edt(outer, cellW, cellH);
    edt(inner, cellW, cellH);
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const p = y * cellW + x;
        const d = Math.sqrt(outer[p] ?? INF) - Math.sqrt(inner[p] ?? INF);
        const v = Math.round(255 - 255 * (d / radius + CUTOFF));
        pixels[(row * cellH + y) * width + col * cellW + x] = Math.max(0, Math.min(255, v));
      }
    }
  });

  return {
    info: {
      width,
      height,
      cellW,
      cellH,
      columns: COLUMNS,
      fontSize,
      buffer,
      baseline,
      advance,
      chars: ATLAS_CHARS,
    },
    pixels,
  };
}
