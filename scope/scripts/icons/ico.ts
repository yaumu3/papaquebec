/** A PNG-compressed ICO image at one square size. */
export interface IcoEntry {
  readonly size: number;
  readonly png: Uint8Array;
}

const HEADER = 6;
const ENTRY = 16;

/** Packs PNG images into an ICO container; browsers accept PNG frames in place of BMP ones. */
export function encodeIco(entries: readonly IcoEntry[]): Uint8Array {
  const directory = HEADER + ENTRY * entries.length;
  const out = new Uint8Array(directory + entries.reduce((n, e) => n + e.png.byteLength, 0));
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  let offset = directory;
  entries.forEach((entry, i) => {
    const at = HEADER + ENTRY * i;
    out[at] = entry.size % 256;
    out[at + 1] = entry.size % 256;
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, 32, true);
    view.setUint32(at + 8, entry.png.byteLength, true);
    view.setUint32(at + 12, offset, true);
    out.set(entry.png, offset);
    offset += entry.png.byteLength;
  });
  return out;
}
