import { describe, expect, it, vi } from "vitest";
import {
  createEngineState,
  initGrid,
  renderCanvas,
  scaleLayer,
  type EngineState,
} from "./canvasEngine";

describe("viewport rendering", () => {
  it("uses the supplied zoom and screen-space pan while keeping draw bounds on integer pixels", () => {
    const context = createContextMock();
    const state: EngineState = {
      width: 2, height: 1,
      layers: [{ id: "base", name: "Base", visible: true, data: [["#ff000080", "#00ff00"]] }],
    };
    renderCanvas(context, state, 4, 0, 0, { zoomLevel: 1.13, panOffset: { x: 0.3, y: -1.2 } });
    const calls = vi.mocked(context.fillRect).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([28, 29, 4, 4]);
    expect(calls[1]).toEqual([32, 29, 5, 4]);
    expect(calls.flat().every(Number.isInteger)).toBe(true);
    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.globalAlpha).toBe(1);
    expect(context.strokeRect).toHaveBeenCalledWith(...calls[0]);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 64, 64);
  });

  it("rejects invalid views before clearing the existing rendering", () => {
    const context = createContextMock();
    expect(() => renderCanvas(context, createEngineState(), 4, 0, 0, {
      zoomLevel: 17, panOffset: { x: 0, y: 0 },
    })).toThrow(RangeError);
    expect(context.clearRect).not.toHaveBeenCalled();
  });

  it("only draws visible cells when editing a large native-resolution texture", () => {
    const context = createContextMock();
    const state: EngineState = {
      width: 128, height: 128,
      layers: [{
        id: "large", name: "Large", visible: true,
        data: Array.from({ length: 128 }, () => Array<string>(128).fill("#123456")),
      }],
    };
    renderCanvas(context, state, 32, 0, 0, { zoomLevel: 1, panOffset: { x: 0, y: 0 } });
    expect(context.fillRect).toHaveBeenCalledTimes(4);
    expect(context.strokeRect).toHaveBeenCalledTimes(4);
    expect(state.layers[0].data).toHaveLength(128);
  });

  it("omits grid strokes at tiny zoom levels so they do not obscure the texture", () => {
    const context = createContextMock();
    renderCanvas(context, {
      width: 1, height: 1,
      layers: [{ id: "base", name: "Base", visible: true, data: [["#ffffff"]] }],
    }, 32, 0, 0, { zoomLevel: 0.01, panOffset: { x: 0, y: 0 } });
    expect(context.strokeRect).not.toHaveBeenCalled();
    expect(context.imageSmoothingEnabled).toBe(false);
  });
});

describe("scaleLayer", () => {
  it("maps each source pixel to an exact 2 by 2 block including transparency", () => {
    const data = [["#123456", null], ["#abcdef", "#ffffff"]];
    expect(scaleLayer(data, 2, 4)).toEqual([
      ["#123456", "#123456", null, null],
      ["#123456", "#123456", null, null],
      ["#abcdef", "#abcdef", "#ffffff", "#ffffff"],
      ["#abcdef", "#abcdef", "#ffffff", "#ffffff"],
    ]);
    expect(data).toEqual([["#123456", null], ["#abcdef", "#ffffff"]]);
  });

  it("uses floor-based nearest neighbors for non-integer upscaling and downscaling", () => {
    const data = [["#111111", "#222222"], ["#333333", "#444444"]];
    expect(scaleLayer(data, 2, 3)).toEqual([
      ["#111111", "#111111", "#222222"],
      ["#111111", "#111111", "#222222"],
      ["#333333", "#333333", "#444444"],
    ]);
    expect(scaleLayer(data, 2, 1)).toEqual([["#111111"]]);
  });

  it("creates independent rows even when the size is unchanged", () => {
    const data = initGrid(2);
    const scaled = scaleLayer(data, 2, 2);
    scaled[0][0] = "#ffffff";
    expect(data[0][0]).toBeNull();
    expect(scaled[1][0]).toBeNull();
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid size %s", (size) => {
    expect(() => scaleLayer(initGrid(2), 2, size)).toThrow(RangeError);
    expect(() => scaleLayer(initGrid(2), size, 4)).toThrow(RangeError);
  });

  it("rejects inconsistent source dimensions", () => {
    expect(() => scaleLayer([[null]], 2, 4)).toThrow("square");
  });
});

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
  it.each([0, 1, 2, 3])("renders exact distance-based alpha values at range %s", (range) => {
    const context = createContextMock();
    const draws: Array<{ color: string | CanvasGradient | CanvasPattern; alpha: number }> = [];
    vi.mocked(context.fillRect).mockImplementation(() => {
      draws.push({ color: context.fillStyle, alpha: context.globalAlpha });
    });
    const state: EngineState = {
      width: 1, height: 1,
      layers: Array.from({ length: 9 }, (_, index) => ({
        id: `${index}`, name: `Layer ${index}`, visible: true,
        data: [[`#00000${index}`]],
      })),
    };
    context.globalAlpha = 0.1;
    renderCanvas(context, state, 4, 4, range);
    expect(draws).toEqual(state.layers.flatMap((layer, index) => {
      const distance = Math.abs(index - 4);
      return distance <= range ? [{ color: layer.data[0][0], alpha: 1 / 2 ** distance }] : [];
    }));
    expect(context.globalAlpha).toBe(1);
    expect(context.strokeRect).toHaveBeenCalledOnce();
  });

  it("does not render a hidden active layer or hidden neighbors", () => {
    const context = createContextMock();
    const state: EngineState = {
      width: 1, height: 1,
      layers: [
        { id: "a", name: "A", visible: false, data: [["#ffffff"]] },
        { id: "b", name: "B", visible: false, data: [["#123456"]] },
      ],
    };
    renderCanvas(context, state, 4, 0, 3);
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.globalAlpha).toBe(1);
  });

  it("keeps neighboring layers translucent on every row", () => {
    const context = createContextMock();
    const alphas: number[] = [];
    vi.mocked(context.fillRect).mockImplementation(() => alphas.push(context.globalAlpha));
    const state: EngineState = {
      width: 1, height: 2,
      layers: [
        { id: "a", name: "A", visible: true, data: [["#ffffff"], ["#ffffff"]] },
        { id: "b", name: "B", visible: true, data: [[null], [null]] },
      ],
    };
    renderCanvas(context, state, 4, 1, 1);
    expect(alphas).toEqual([0.5, 0.5]);
    expect(context.globalAlpha).toBe(1);
  });

  it.each([-1, 4, 1.5, NaN])("rejects invalid onion range %s before drawing", (range) => {
    const context = createContextMock();
    expect(() => renderCanvas(context, createEngineState(), 4, 0, range)).toThrow(RangeError);
    expect(context.clearRect).not.toHaveBeenCalled();
  });

  it.each([-1, 1, 0.5, NaN])("rejects invalid active layer index %s", (index) => {
    const context = createContextMock();
    expect(() => renderCanvas(context, createEngineState(), 4, index, 0)).toThrow(RangeError);
  });

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

    renderCanvas(context, state, 8, 0, 0);

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

    renderCanvas(context, state, 4, 2, 2);

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

    renderCanvas(context, state, 4, 0, 0);

    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.strokeRect).toHaveBeenCalledOnce();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid UI scale %s",
    (scale) => {
      const context = createContextMock();

      expect(() => renderCanvas(context, createEngineState(1, 1), scale, 0, 0)).toThrow(
        RangeError,
      );
      expect(context.clearRect).not.toHaveBeenCalled();
    },
  );
});
