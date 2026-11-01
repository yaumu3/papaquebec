import { ATLAS_CHARS } from '../atlas/build';
import type { AtlasInfo } from '../protocol';

const COLUMNS = 16;
const CELL_H = 20;

/** A small monospace atlas holding every glyph the scope prints. */
export const atlas: AtlasInfo = {
  width: 160,
  height: CELL_H * Math.ceil(ATLAS_CHARS.length / COLUMNS),
  cellW: 10,
  cellH: CELL_H,
  columns: COLUMNS,
  fontSize: 40,
  buffer: 2,
  baseline: 16,
  advance: 6,
  chars: ATLAS_CHARS,
};
