import { createSignal, onCleanup, onMount } from 'solid-js';

/** The laid-out width of the element `el` gives once mounted, followed through resizes. */
export function trackWidth(el: () => Element | undefined): () => number {
  const [width, setWidth] = createSignal(0);
  onMount(() => {
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
