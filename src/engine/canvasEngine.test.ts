import { describe, expect, it, vi } from "vitest";
import {
  createEngineState,
  initGrid,
  renderCanvas,
  type EngineState,
} from "./canvasEngine";

function createContextMock() {
  const context = {
    canvas: { width: 64, height: 64 },
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  };

  return context as unknown as CanvasRenderingContext2D;
}

describe("initGrid", () => {
  it("creates a square grid filled with transparent pixels", () => {
    expect(initGrid(2)).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it("creates independent rows", () => {
    const grid = initGrid(2);
    grid[0]![0] = "#ff0000";

    expect(grid[1]).toEqual([null, null]);
  });

  it("allows an empty grid", () => {
    expect(initGrid(0)).toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN])("rejects invalid grid size %s", (size) => {
    expect(() => initGrid(size)).toThrow(RangeError);
  });
});

describe("createEngineState", () => {
  it("uses the default 16 by 16 dimensions", () => {
    expect(createEngineState()).toEqual({
      width: 16,
      height: 16,
      layers: [],
    });
  });

  it("accepts custom dimensions", () => {
    expect(createEngineState(8, 12)).toEqual({
      width: 8,
      height: 12,
      layers: [],
    });
  });
});

describe("renderCanvas", () => {
  it("clears the canvas, draws visible pixels at the requested scale, then overlays a grid", () => {
    const context = createContextMock();
    const state: EngineState = {
      width: 2,
      height: 2,
      layers: [
        {
          id: "base",
          name: "Base",
          visible: true,
          data: [
            ["#ff0000", null],
            [null, "#00ff00"],
          ],
        },
      ],
    };

    renderCanvas(context, state, 8);

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 64, 64);
    expect(context.fillRect).toHaveBeenCalledTimes(2);
    expect(context.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 8, 8);
    expect(context.fillRect).toHaveBeenNthCalledWith(2, 8, 8, 8, 8);
    expect(context.strokeRect).toHaveBeenCalledTimes(4);
    expect(context.strokeStyle).toBe("rgba(0, 0, 0, 0.18)");
    expect(context.save).toHaveBeenCalledOnce();
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it("composites visible layers in array order and skips hidden layers", () => {
    const context = createContextMock();
    const state: EngineState = {
      width: 1,
      height: 1,
      layers: [
        {
          id: "bottom",
          name: "Bottom",
          visible: true,
          data: [["#111111"]],
        },
        {
          id: "hidden",
          name: "Hidden",
          visible: false,
          data: [["#222222"]],
        },
        {
          id: "top",
          name: "Top",
          visible: true,
          data: [["#333333"]],
        },
      ],
    };

    renderCanvas(context, state, 4);

    expect(context.fillRect).toHaveBeenCalledTimes(2);
    expect(context.fillStyle).toBe("#333333");
  });

  it("does not draw transparent pixels", () => {
    const context = createContextMock();
    const state: EngineState = {
      width: 1,
      height: 1,
      layers: [
        { id: "empty", name: "Empty", visible: true, data: [[null]] },
      ],
    };

    renderCanvas(context, state, 4);

    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.strokeRect).toHaveBeenCalledOnce();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid UI scale %s",
    (scale) => {
      const context = createContextMock();

      expect(() => renderCanvas(context, createEngineState(1, 1), scale)).toThrow(
        RangeError,
      );
      expect(context.clearRect).not.toHaveBeenCalled();
    },
  );
});
