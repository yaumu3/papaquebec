import { createEffect, createSignal, onCleanup } from 'solid-js';

/** The laid-out width of the element `el` gives, from when it gives one, followed through resizes. */
export function trackWidth(el: () => Element | undefined): () => number {
  const [width, setWidth] = createSignal(0);
  createEffect(() => {
    const target = el();
    if (!target) return;
    setWidth(target.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    observer.observe(target);
    onCleanup(() => observer.disconnect());
  });
  return width;
}
