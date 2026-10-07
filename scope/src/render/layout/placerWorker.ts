/**
 * The placer's worker: places each scene it is sent, in the placer crate as WebAssembly, and
 * answers with the bearings.
 */
import { NE } from '../../lib/datablock';
import { encodeScene } from './encode';
import type { FromPlacer, ToPlacer } from './placer';
import init, { place } from './wasm/placer';

const ready = init();
const seed = () => Math.floor(Math.random() * 2 ** 32);

self.addEventListener('message', (e: MessageEvent<ToPlacer>) => {
  void ready
    .then(() => {
      const { scene } = e.data;
      const dirs = place(encodeScene(scene), scene.pxPerNm, seed());
      const reply: FromPlacer = {
        dirs: new Map(scene.subjects.map((s, i) => [s.hex, dirs[i] ?? NE])),
      };
      self.postMessage(reply);
    })
    .catch((err: unknown) => reportError(err));
});
