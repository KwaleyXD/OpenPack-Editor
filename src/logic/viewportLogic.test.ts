import { describe, expect, it } from "vitest";
import { getCanvasTransform, zoomAtPoint } from "./viewportLogic";

describe("viewport math", () => {
  it("centers rectangular textures and adds screen-pixel pan offsets", () => {
    expect(getCanvasTransform(16, 8, 1000, 600, 32, {
      zoomLevel: 2, panOffset: { x: 10, y: -20 },
    })).toEqual({ x: -2, y: 24, scale: 64 });
  });

  it("preserves the texture coordinate beneath the cursor when zooming", () => {
    const view = { zoomLevel: 1.5, panOffset: { x: 20, y: -40 } };
    const cursor = { x: 133, y: 189 }, center = { x: 400, y: 300 };
    const next = zoomAtPoint(view, 4.2, cursor, center);
    const before = getCanvasTransform(16, 16, 800, 600, 32, view);
    const after = getCanvasTransform(16, 16, 800, 600, 32, next);
    expect((cursor.x - before.x) / before.scale).toBeCloseTo((cursor.x - after.x) / after.scale, 12);
    expect((cursor.y - before.y) / before.scale).toBeCloseTo((cursor.y - after.y) / after.scale, 12);
  });

  it("keeps the zoom-in cap but allows repeated zooming far below 25%", () => {
    const view = { zoomLevel: 1, panOffset: { x: 0, y: 0 } };
    const center = { x: 256, y: 256 }, cursor = { x: 30, y: 50 };
    const max = zoomAtPoint(view, 100, cursor, center);
    expect(max.zoomLevel).toBe(16);
    expect(zoomAtPoint(max, 1000, cursor, center)).toEqual(max);
    let smaller = zoomAtPoint(view, 0.01, cursor, center);
    expect(smaller.zoomLevel).toBe(0.01);
    for (let i = 0; i < 100; i += 1) {
      const previous = smaller.zoomLevel;
      smaller = zoomAtPoint(smaller, previous / 2, cursor, center);
      expect(smaller.zoomLevel).toBe(previous / 2);
      expect(Number.isFinite(smaller.panOffset.x)).toBe(true);
    }
    expect(smaller.zoomLevel).toBeLessThan(1e-30);
  });

  it("guards only machine-number underflow without allowing zero zoom", () => {
    const view = { zoomLevel: Number.MIN_VALUE, panOffset: { x: 0, y: 0 } };
    const next = zoomAtPoint(view, view.zoomLevel / 2, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(next.zoomLevel).toBe(Number.MIN_VALUE);
    expect(next.panOffset).toEqual({ x: 0, y: 0 });
  });

  it("rejects invalid zoom or offsets", () => {
    expect(() => getCanvasTransform(16, 16, 512, 512, 32, {
      zoomLevel: 0, panOffset: { x: 0, y: 0 },
    })).toThrow(RangeError);
    expect(() => getCanvasTransform(16, 16, 512, 512, 32, {
      zoomLevel: 1, panOffset: { x: NaN, y: 0 },
    })).toThrow(RangeError);
    expect(() => zoomAtPoint({ zoomLevel: 1, panOffset: { x: 0, y: 0 } }, NaN, { x: 0, y: 0 }, { x: 0, y: 0 })).toThrow(RangeError);
    expect(() => zoomAtPoint({ zoomLevel: 1, panOffset: { x: 0, y: 0 } }, -1, { x: 0, y: 0 }, { x: 0, y: 0 })).toThrow(RangeError);
    expect(() => zoomAtPoint({ zoomLevel: 0, panOffset: { x: 0, y: 0 } }, 2, { x: 0, y: 0 }, { x: 0, y: 0 })).toThrow(RangeError);
    expect(() => zoomAtPoint({ zoomLevel: 1, panOffset: { x: 0, y: 0 } }, 2, { x: NaN, y: 0 }, { x: 0, y: 0 })).toThrow(RangeError);
  });
});
