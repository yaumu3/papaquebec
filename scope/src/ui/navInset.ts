/** How much of the viewport's foot the nav bar takes: its height and the space under it. None while it is not laid out. */
export function navInset(viewportHeight: number, bar: { top: number; height: number }): number {
  return bar.height === 0 ? 0 : Math.max(0, viewportHeight - bar.top);
}

const PROPERTY = '--nav-inset';

/** Publishes the bar's inset as `--nav-inset` on the root while it is laid out. Returns a disposer. */
export function trackNavInset(bar: HTMLElement): () => void {
  const root = document.documentElement;
  const publish = () => {
    root.style.setProperty(PROPERTY, `${navInset(innerHeight, bar.getBoundingClientRect())}px`);
  };
  const observer = new ResizeObserver(publish);
  observer.observe(bar);
  addEventListener('resize', publish);
  publish();
  return () => {
    observer.disconnect();
    removeEventListener('resize', publish);
    root.style.removeProperty(PROPERTY);
  };
}
