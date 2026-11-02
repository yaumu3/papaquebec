/** How long a hidden page, which draws no frames, waits instead, in ms. */
const NO_FRAME_MS = 250;

/** Resolves once the next frame is out of the way. */
export const afterFrame = (): Promise<void> =>
  new Promise((done) => {
    const timer = setTimeout(done, NO_FRAME_MS);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      setTimeout(done);
    });
  });
