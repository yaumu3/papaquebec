import type { AtlasInfo } from '../protocol';

/** A small monospace atlas holding every glyph the scope prints. */
export const atlas: AtlasInfo = {
  width: 160,
  height: 40,
  cellW: 10,
  cellH: 20,
  columns: 16,
  fontSize: 40,
  buffer: 2,
  baseline: 16,
  advance: 6,
  chars:
    ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~↑↓°·',
};
