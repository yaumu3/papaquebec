/// <reference lib="webworker" />
import { GpuRenderer } from './gpu/renderer';
import type { FromWorker, ToWorker } from './protocol';

const post = (m: FromWorker) => self.postMessage(m);

let renderer: GpuRenderer | null = null;

/** Whether this worker can actually get a device, not just whether the API exists. */
const hasAdapter = () =>
  navigator.gpu?.requestAdapter().then(
    (a) => a !== null,
    () => false,
  ) ?? Promise.resolve(false);

self.addEventListener('message', (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    switch (m.type) {
      case 'probe':
        void hasAdapter().then((webgpu) => post({ type: 'probe', webgpu }));
        break;
      case 'init': {
        const r = new GpuRenderer(m.canvas);
        r.onError = (message) => post({ type: 'error', message });
        renderer = r;
        void r.init(m.view).then(
          (adapter) => {
            post({ type: 'ready', adapter });
            void r.lost.then((info) => post({ type: 'lost', reason: info.message }));
          },
          (err: unknown) => post({ type: 'error', message: String(err) }),
        );
        break;
      }
      case 'atlas':
        renderer?.setAtlas(m.info, m.pixels);
        break;
      case 'layer':
        renderer?.setLayer(m.name, m.batches);
        break;
      case 'view':
        renderer?.setView(m.view);
        break;
      case 'draw':
        renderer?.draw(m.order);
        break;
    }
  } catch (err) {
    post({ type: 'error', message: String(err) });
  }
});
