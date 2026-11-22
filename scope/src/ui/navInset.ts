/** How much of the viewport's foot the nav bar takes: its height and the space under it. None while it is not laid out. */
export function navInset(viewportHeight: number, bar: { top: number; height: number }): number {
  return bar.height === 0 ? 0 : Math.max(0, viewportHeight - bar.top);
}
