export function createFrameScheduler(draw: () => void) {
  let frame: number | null = null;
  return {
    request() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        draw();
      });
    },
    cancel() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
