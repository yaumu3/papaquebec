import { onCleanup, onMount } from 'solid-js';

import { setCanvasSize } from '../state/scope';
import { attachInput } from './input';
import { mountScene } from './scene';
import { createView } from './view';

import s from './ScopeCanvas.module.css';

export function ScopeCanvas() {
  let el: HTMLCanvasElement | undefined;
  const view = createView();

  onMount(() => {
    const canvas = el;
    if (!canvas) return;
    const measure = () => {
      const r = canvas.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(1, r.width),
        height: Math.max(1, r.height),
        dpr: window.devicePixelRatio || 1,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    const onDpr = () => measure();
    window.addEventListener('resize', onDpr);
    mountScene(canvas, view);
    const detach = attachInput(canvas, view);
    onCleanup(() => {
      ro.disconnect();
      window.removeEventListener('resize', onDpr);
      detach();
    });
  });

  return (
    <canvas
      class={s.canvas}
      ref={(node) => {
        el = node;
      }}
    />
  );
}
