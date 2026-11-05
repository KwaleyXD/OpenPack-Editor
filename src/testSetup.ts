import { afterEach, beforeEach, vi } from "vitest";

// Flush scheduled paints after Vue's DOM updates without wall-clock delays.
let nextFrame = 0;
const pendingFrames = new Set<number>();
beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++nextFrame;
    pendingFrames.add(id);
    queueMicrotask(() => {
      if (pendingFrames.delete(id)) callback(performance.now());
    });
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    pendingFrames.delete(id);
  });
});
afterEach(() => pendingFrames.clear());
