import { PALETTE } from '../../design/palette';
import {
  type AtlasInfo,
  type Batch,
  type BatchKind,
  LINE_STRIDE,
  MARKER_STRIDE,
  TEXT_STRIDE,
  type View,
} from '../protocol';
import { webgpuMissingReason } from './availability';
import { LINE_SHADER, MARKER_SHADER, TEXT_SHADER, VIEW_UNIFORM_BYTES } from './shaders';

/** The palette's background as a GPU clear color. */
function clearColor(hex: string): GPUColor {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return { r, g, b, a: 1 };
}
const BG = clearColor(PALETTE.bg);
const SAMPLE_COUNT = 4;

interface GpuBatch {
  kind: BatchKind;
  buffer: GPUBuffer;
  capacity: number;
  count: number;
}

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

function instanceLayout(stride: number, attrs: [number, GPUVertexFormat][]): GPUVertexBufferLayout {
  let offset = 0;
  const attributes: GPUVertexAttribute[] = attrs.map(([location, format]) => {
    const a = { shaderLocation: location, offset, format };
    offset +=
      format === 'float32x4' ? 16 : format === 'float32x3' ? 12 : format === 'float32x2' ? 8 : 4;
    return a;
  });
  return { arrayStride: stride * 4, stepMode: 'instance', attributes };
}

/**
 * Raw WebGPU renderer. Owns the device and every GPU resource; holds no scene
 * state beyond the packed instance buffers it was last given per named layer.
 * One draw call per batch, whatever the object count.
 */
export class GpuRenderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private pipelines!: Record<BatchKind, GPURenderPipeline>;
  private viewBuffer!: GPUBuffer;
  private viewBindGroup!: GPUBindGroup;
  private atlasBindGroup: GPUBindGroup | null = null;
  private atlasLayout!: GPUBindGroupLayout;
  private msaa: GPUTexture | null = null;
  private layers = new Map<string, GpuBatch[]>();
  private view: View | null = null;
  private sizeDirty = true;

  constructor(private readonly canvas: CanvasLike) {}

  /** Called with every uncaptured validation error; the scope must say when it cannot draw. */
  onError: (message: string) => void = () => undefined;

  async init(view: View): Promise<string> {
    const missing = webgpuMissingReason(Boolean(navigator.gpu), isSecureContext);
    if (missing) throw new Error(missing);
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter');
    this.device = await adapter.requestDevice();
    this.device.addEventListener('uncapturederror', (e) => this.onError(e.error.message));
    const ctx = this.canvas.getContext('webgpu');
    if (!ctx) throw new Error('No webgpu canvas context');
    this.context = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    this.createPipelines();
    this.setView(view);
    const info = adapter.info;
    const parts = [info.vendor, info.architecture, info.device, info.description].filter(Boolean);
    return [...new Set(parts)].join(' ') || 'webgpu';
  }

  get lost(): Promise<GPUDeviceLostInfo> {
    return this.device.lost;
  }

  private createPipelines(): void {
    const { device } = this;
    const viewLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });
    this.atlasLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    this.viewBuffer = device.createBuffer({
      size: VIEW_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.viewBindGroup = device.createBindGroup({
      layout: viewLayout,
      entries: [{ binding: 0, resource: { buffer: this.viewBuffer } }],
    });
    const blend: GPUBlendState = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    const make = (code: string, layouts: GPUBindGroupLayout[], vertex: GPUVertexBufferLayout) => {
      const module = device.createShaderModule({ code });
      void module.getCompilationInfo().then((info) => {
        for (const m of info.messages) {
          if (m.type === 'error') this.onError(`WGSL ${m.lineNum}:${m.linePos} ${m.message}`);
        }
      });
      return device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: layouts }),
        vertex: { module, entryPoint: 'vs', buffers: [vertex] },
        fragment: { module, entryPoint: 'fs', targets: [{ format: this.format, blend }] },
        primitive: { topology: 'triangle-list' },
        multisample: { count: SAMPLE_COUNT },
      });
    };
    this.pipelines = {
      lines: make(
        LINE_SHADER,
        [viewLayout],
        instanceLayout(LINE_STRIDE, [
          [0, 'float32x4'],
          [1, 'float32x4'],
          [2, 'float32x3'],
          [3, 'float32x4'],
        ]),
      ),
      markers: make(
        MARKER_SHADER,
        [viewLayout],
        instanceLayout(MARKER_STRIDE, [
          [0, 'float32x4'],
          [1, 'float32x2'],
          [2, 'float32x4'],
        ]),
      ),
      text: make(
        TEXT_SHADER,
        [viewLayout, this.atlasLayout],
        instanceLayout(TEXT_STRIDE, [
          [0, 'float32x4'],
          [1, 'float32x2'],
          [2, 'float32x4'],
          [3, 'float32x4'],
        ]),
      ),
    };
  }

  setAtlas(info: AtlasInfo, pixels: Uint8Array): void {
    const texture = this.device.createTexture({
      size: { width: info.width, height: info.height },
      format: 'r8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture(
      { texture },
      pixels,
      { bytesPerRow: info.width },
      { width: info.width, height: info.height },
    );
    const sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.atlasBindGroup = this.device.createBindGroup({
      layout: this.atlasLayout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: texture.createView() },
      ],
    });
  }

  setView(view: View): void {
    const w = Math.max(1, Math.round(view.widthPx * view.dpr));
    const h = Math.max(1, Math.round(view.heightPx * view.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.sizeDirty = true;
    }
    this.view = view;
    this.device.queue.writeBuffer(
      this.viewBuffer,
      0,
      new Float32Array([view.centerX, view.centerY, view.pxPerNm, view.dpr, w, h, 0, 0]),
    );
  }

  setLayer(name: string, batches: Batch[]): void {
    const existing = this.layers.get(name) ?? [];
    const next: GpuBatch[] = batches.map((b, i) => {
      const prev = existing[i];
      const bytes = b.data.byteLength;
      let gpu: GpuBatch;
      if (prev && prev.kind === b.kind && prev.capacity >= bytes) {
        gpu = prev;
      } else {
        prev?.buffer.destroy();
        const capacity = Math.max(256, bytes);
        gpu = {
          kind: b.kind,
          capacity,
          count: 0,
          buffer: this.device.createBuffer({
            size: capacity,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          }),
        };
      }
      if (bytes > 0) this.device.queue.writeBuffer(gpu.buffer, 0, b.data);
      gpu.count = b.count;
      return gpu;
    });
    for (const stale of existing.slice(batches.length)) stale.buffer.destroy();
    this.layers.set(name, next);
  }

  private ensureMsaa(): GPUTextureView {
    if (this.sizeDirty || !this.msaa) {
      this.msaa?.destroy();
      this.msaa = this.device.createTexture({
        size: { width: this.canvas.width, height: this.canvas.height },
        sampleCount: SAMPLE_COUNT,
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.sizeDirty = false;
    }
    return this.msaa.createView();
  }

  draw(order: readonly string[]): void {
    if (!this.view) return;
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.ensureMsaa(),
          resolveTarget: this.context.getCurrentTexture().createView(),
          clearValue: BG,
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
    });
    pass.setBindGroup(0, this.viewBindGroup);
    for (const name of order) {
      for (const b of this.layers.get(name) ?? []) {
        if (b.count === 0) continue;
        if (b.kind === 'text') {
          if (!this.atlasBindGroup) continue;
          pass.setBindGroup(1, this.atlasBindGroup);
        }
        pass.setPipeline(this.pipelines[b.kind]);
        pass.setVertexBuffer(0, b.buffer);
        pass.draw(6, b.count);
      }
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    for (const batches of this.layers.values()) for (const b of batches) b.buffer.destroy();
    this.layers.clear();
    this.msaa?.destroy();
    this.device.destroy();
  }
}
