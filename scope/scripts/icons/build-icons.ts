/**
 * Rasterises the app icon into `public/` for `index.html` to link: `favicon.ico` carries the
 * 16 px artwork and the master at 32 px, `icon-192.png` the rounded master, and
 * `apple-touch-icon.png` the square tile for iOS to mask itself. Runs before every build.
 */
import { writeFileSync } from 'node:fs';

import { Resvg } from '@resvg/resvg-js';

import { encodeIco } from './ico';
import { ICON_16, ICON_MASTER, iconSvg, type IconArt } from './icon';

const OUT = 'public';
/** Corner radius of the rounded tile, in tile units. */
const RADIUS = 12;

function png(art: IconArt, radius: number, size: number): Uint8Array {
  const svg = iconSvg(art, radius);
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

const files: Record<string, Uint8Array> = {
  'favicon.ico': encodeIco([
    { size: 16, png: png(ICON_16, RADIUS, 16) },
    { size: 32, png: png(ICON_MASTER, RADIUS, 32) },
  ]),
  'icon-192.png': png(ICON_MASTER, RADIUS, 192),
  'apple-touch-icon.png': png(ICON_MASTER, 0, 180),
};

for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(`${OUT}/${name}`, bytes);
  console.log(`${name} -> ${OUT}/${name}`);
}
