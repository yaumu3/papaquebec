import { GpuRenderer } from './gpu/renderer';
import type { AtlasInfo, Batch, FromWorker, ToWorker, View } from './protocol';

export type RenderStatus =
  | { kind: 'starting' }
  | { kind: 'ready'; adapter: string; where: 'worker' | 'main' }
  | { kind: 'error'; message: string };

export interface Renderer {
  setView(view: View): void;
  setAtlas(info: AtlasInfo, pixels: Uint8Array): void;
  setLayer(name: string, batches: Batch[]): void;
  /** Coalesced through requestAnimationFrame; many calls, one frame. */
  draw(order: readonly string[]): void;
  destroy(): void;
}

/** What the main thread keeps until the renderer is ready, then replays into it. */
interface Retained {
  view: View | null;
  atlas: { info: AtlasInfo; pixels: Uint8Array } | null;
  layers: Map<string, Batch[]>;
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
  let frame = 0;
  let pendingOrder: readonly string[] = [];
  let ready = false;
  let destroyed = false;

  const send = (m: ToWorker, transfer: Transferable[] = []) => worker?.postMessage(m, transfer);

  const replay = () => {
    if (retained.atlas) {
      if (local) local.setAtlas(retained.atlas.info, retained.atlas.pixels);
      else send({ type: 'atlas', info: retained.atlas.info, pixels: retained.atlas.pixels });
    }
    for (const [name, batches] of retained.layers) {
      if (local) local.setLayer(name, batches);
      else send({ type: 'layer', name, batches });
    }
    if (retained.view) {
      if (local) local.setView(retained.view);
      else send({ type: 'view', view: retained.view });
    }
  };

  const startMain = async () => {
    if (destroyed) return;
    local = new GpuRenderer(canvas);
    local.onError = (message) => onStatus({ kind: 'error', message });
    try {
      const adapter = await local.init(view);
      ready = true;
      replay();
      onStatus({ kind: 'ready', adapter, where: 'main' });
      api.draw(pendingOrder);
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
        ready = true;
        replay();
        onStatus({ kind: 'ready', adapter: m.adapter, where: 'worker' });
        api.draw(pendingOrder);
      } else if (m.type === 'error') {
        onStatus({ kind: 'error', message: m.message });
      } else if (m.type === 'lost') {
        ready = false;
        w.terminate();
        worker = null;
        if (!destroyed)
          onStatus({ kind: 'error', message: `GPU device lost: ${m.reason}; reload the page` });
      }
    });
    const offscreen = canvas.transferControlToOffscreen();
    send({ type: 'init', canvas: offscreen, view }, [offscreen]);
  };

  const api: Renderer = {
    setView(v) {
      retained.view = v;
      if (!ready) return;
      if (local) local.setView(v);
      else send({ type: 'view', view: v });
    },
    setAtlas(info, pixels) {
      retained.atlas = { info, pixels };
      if (!ready) return;
      if (local) local.setAtlas(info, pixels);
      else send({ type: 'atlas', info, pixels });
    },
    setLayer(name, batches) {
      retained.layers.set(name, batches);
      if (!ready) return;
      if (local) local.setLayer(name, batches);
      else send({ type: 'layer', name, batches });
    },
    draw(order) {
      pendingOrder = order;
      if (frame || !ready) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (local) local.draw(pendingOrder);
        else send({ type: 'draw', order: [...pendingOrder] });
      });
    },
    destroy() {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      worker?.terminate();
      local?.destroy();
    },
  };

  void startWorker();
  return api;
}
