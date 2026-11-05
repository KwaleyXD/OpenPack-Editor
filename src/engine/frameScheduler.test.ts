import { afterEach, describe, expect, it, vi } from "vitest";
import { createFrameScheduler } from "./frameScheduler";

afterEach(() => vi.restoreAllMocks());

describe("frame scheduler", () => {
  it("coalesces any number of invalidations into one paint and schedules later frames", () => {
    let callback: FrameRequestCallback | undefined;
    const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((next) => {
      callback = next;
      return 1;
    });
    const draw = vi.fn();
    const frame = createFrameScheduler(draw);
    for (let i = 0; i < 100; i++) frame.request();
    expect(request).toHaveBeenCalledOnce();
    expect(draw).not.toHaveBeenCalled();
    callback!(0);
    expect(draw).toHaveBeenCalledOnce();
    frame.request();
    expect(request).toHaveBeenCalledTimes(2);
    frame.cancel();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
  });
});
