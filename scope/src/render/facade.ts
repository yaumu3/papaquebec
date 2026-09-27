import { GpuRenderer } from './gpu/renderer';
import type { LayerName } from './layers';
import {
  type AtlasInfo,
  type Batch,
  type FromWorker,
  type ToWorker,
  transferables,
  type View,
} from './protocol';

export type RenderStatus =
  | { kind: 'starting' }
  | { kind: 'ready'; adapter: string; where: 'worker' | 'main' }
  | { kind: 'error'; message: string };

/** Takes the scene as it changes and draws it, one frame per animation frame at most. */
export interface Renderer {
  setView(view: View): void;
  setAtlas(info: AtlasInfo, pixels: Uint8Array): void;
  /** Takes the batches: once the renderer is up their buffers move to the worker, unusable here. */
  setLayer(name: LayerName, batches: Batch[]): void;
  destroy(): void;
}

/**
 * What the main thread keeps until the renderer is ready, then replays into it. Layers are kept
 * only until then: after it, nothing replays them, so they move to the worker instead.
 */
interface Retained {
  view: View | null;
  atlas: { info: AtlasInfo; pixels: Uint8Array } | null;
  layers: Map<LayerName, Batch[]>;
}

/** The calls a ready renderer takes, whether it draws on this thread or in the worker. */
type Sink = Pick<GpuRenderer, 'setView' | 'setAtlas' | 'setLayer' | 'draw'>;

/** Posts each call to the render worker, handing layer buffers over rather than copying them. */
function workerSink(worker: Worker): Sink {
  const post = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
  return {
    setView: (view) => post({ type: 'view', view }),
    setAtlas: (info, pixels) => post({ type: 'atlas', info, pixels }),
    setLayer: (name, batches) => post({ type: 'layer', name, batches }, transferables(batches)),
    draw: () => post({ type: 'draw' }),
  };
}

async function probeWorker(worker: Worker): Promise<boolean> {
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent<FromWorker>) => {
      if (e.data.type === 'probe') {
        worker.removeEventListener('message', onMessage);
        resolve(e.data.webgpu);
      }
    };
    worker.addEventListener('message', onMessage);
    const probe: ToWorker = { type: 'probe' };
    worker.postMessage(probe);
    setTimeout(() => resolve(false), 3000);
  });
}

/**
 * Renders on an OffscreenCanvas in a dedicated worker. If the worker has no
 * WebGPU adapter (Safari before 26, for instance), the same renderer runs on the main
 * thread instead. A lost device is reported and needs a page reload: the canvas went to the
 * worker and cannot be handed to another.
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  view: View,
  onStatus: (s: RenderStatus) => void,
): Renderer {
  const retained: Retained = { view, atlas: null, layers: new Map() };
  let worker: Worker | null = null;
  let local: GpuRenderer | null = null;
  /** Whichever renderer is ready to take calls; null until then and once its device is lost. */
  let sink: Sink | null = null;
  let frame = 0;
  let destroyed = false;

  /** Many changes, one frame: draws on the next animation frame unless one is already due. */
  const requestFrame = () => {
    if (frame || !sink) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      sink?.draw();
    });
  };

  /** Starts taking calls: replays what was kept meanwhile, then draws. */
  const open = (ready: Sink) => {
    sink = ready;
    if (retained.atlas) ready.setAtlas(retained.atlas.info, retained.atlas.pixels);
    for (const [name, batches] of retained.layers) ready.setLayer(name, batches);
    retained.layers.clear();
    if (retained.view) ready.setView(retained.view);
    requestFrame();
  };

  const startMain = async () => {
    if (destroyed) return;
    local = new GpuRenderer(canvas);
    local.onError = (message) => onStatus({ kind: 'error', message });
    try {
      const adapter = await local.init(view);
      open(local);
      onStatus({ kind: 'ready', adapter, where: 'main' });
      void local.lost.then((info) =>
        onStatus({ kind: 'error', message: `GPU device lost: ${info.message}; reload the page` }),
      );
    } catch (err) {
      onStatus({ kind: 'error', message: String(err) });
    }
  };

  const startWorker = async () => {
    onStatus({ kind: 'starting' });
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const usable = 'transferControlToOffscreen' in canvas && (await probeWorker(w));
    if (!usable || destroyed) {
      w.terminate();
      await startMain();
      return;
    }
    worker = w;
    w.addEventListener('message', (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === 'ready') {
        open(workerSink(w));
        onStatus({ kind: 'ready', adapter: m.adapter, where: 'worker' });
      } else if (m.type === 'error') {
        onStatus({ kind: 'error', message: m.message });
      } else if (m.type === 'lost') {
        sink = null;
        w.terminate();
        worker = null;
        if (!destroyed)
          onStatus({ kind: 'error', message: `GPU device lost: ${m.reason}; reload the page` });
      }
    });
    const offscreen = canvas.transferControlToOffscreen();
    const init: ToWorker = { type: 'init', canvas: offscreen, view };
    w.postMessage(init, [offscreen]);
  };

  void startWorker();
  return {
    setView(v) {
      retained.view = v;
      sink?.setView(v);
      requestFrame();
    },
    setAtlas(info, pixels) {
      retained.atlas = { info, pixels };
      sink?.setAtlas(info, pixels);
      requestFrame();
    },
    setLayer(name, batches) {
      if (sink) sink.setLayer(name, batches);
      else retained.layers.set(name, batches);
      requestFrame();
    },
    destroy() {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      worker?.terminate();
      local?.destroy();
    },
  };
}
