import { describe, expect, it } from "vitest";
import { initGrid } from "../engine/canvasEngine";
import {
  applyFloodFill, applyFillAll, applyPencil, applyEraser, pickColor, applyLine,
  applyRectangle, applyCircle, applyDitherPen, getMirroredCoordinates,
  applyShade, shadeColor,
} from "./toolLogic";

describe("pixel shading", () => {
  it("lightens and darkens RGB channels while preserving alpha", () => {
    expect(shadeColor("#80402080", "lighten")).toBe("#99664d80");
    expect(shadeColor("#80402080", "darken")).toBe("#66331a80");
    expect(shadeColor("#abc", "lighten")).toBe("#bbc9d6");
  });

  it("leaves transparent pixels untouched and applies symmetry", () => {
    const data = [[null, "#808080", "#000000", null]];
    applyShade(data, 1, 0, "lighten", { horizontal: true });
    expect(data).toEqual([[null, "#999999", "#333333", null]]);
  });

  it("rejects malformed colors and invalid adjustment amounts", () => {
    expect(() => shadeColor("red", "lighten")).toThrow(RangeError);
    expect(() => shadeColor("#ffffff", "darken", 2)).toThrow(RangeError);
  });
});

describe("Fill All", () => {
  it("replaces disconnected occurrences while preserving other colors and alpha", () => {
    const data = [
      ["#12345680", "#000000", "#12345680"],
      ["#123456", null, "#123456ff"],
      ["#000000", "#12345680", null],
    ];
    applyFillAll(data, 0, 0, "#abcdef40");
    expect(data).toEqual([
      ["#abcdef40", "#000000", "#abcdef40"],
      ["#123456", null, "#123456ff"],
      ["#000000", "#abcdef40", null],
    ]);
  });

  it("fills all transparent pixels, including separated cells on ragged rows", () => {
    const data = [[null, "#000000", null], ["#000000"], [null, null]];
    applyFillAll(data, 0, 0, "#ffffff");
    expect(data).toEqual([["#ffffff", "#000000", "#ffffff"], ["#000000"], ["#ffffff", "#ffffff"]]);
  });

  it("leaves already matching colors unchanged", () => {
    const data = [["#123456", null, "#123456"]];
    applyFillAll(data, 0, 0, "#123456");
    expect(data).toEqual([["#123456", null, "#123456"]]);
  });

  it.each([[-1, 0], [3, 0], [0, 1], [0.5, 0], [NaN, 0]])(
    "rejects invalid coordinates (%s, %s) before mutation", (x, y) => {
      const data = [[null, "#000000", null]];
      expect(() => applyFillAll(data, x, y, "#ffffff")).toThrow(RangeError);
      expect(data).toEqual([[null, "#000000", null]]);
    },
  );
});

describe("drawing tools", () => {
  it("pencils and erases exactly the requested pixel", () => {
    const data = initGrid(2);
    applyPencil(data, 1, 0, "#123456");
    expect(data).toEqual([[null, "#123456"], [null, null]]);
    expect(pickColor(data, 1, 0)).toBe("#123456");
    applyPencil(data, 1, 0, null);
    expect(pickColor(data, 1, 0)).toBeNull();
  });

  describe("geometric tools", () => {
    const color = "#12345680";
    const pixels = (grid: ReturnType<typeof initGrid>) =>
      grid.flatMap((row, y) => row.flatMap((pixel, x) => pixel === null ? [] : [[x, y]]));

    it.each([
      [0, 0, 4, 0], [4, 0, 0, 0], [2, 0, 2, 4], [2, 4, 2, 0],
      [0, 0, 4, 4], [4, 4, 0, 0], [0, 4, 4, 0], [4, 0, 0, 4],
      [0, 0, 4, 2], [4, 2, 0, 0], [0, 0, 2, 4], [2, 4, 0, 0],
      [0, 4, 4, 2], [4, 2, 0, 4], [2, 0, 0, 4], [0, 4, 2, 0],
    ])("draws a connected Bresenham line from (%s,%s) to (%s,%s)", (x0, y0, x1, y1) => {
      const data = initGrid(5);
      applyLine(data, x0, y0, x1, y1, color);
      expect(data[y0][x0]).toBe(color);
      expect(data[y1][x1]).toBe(color);
      const points = pixels(data);
      expect(points).toHaveLength(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1);
      points.sort((a, b) => Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? a[0] - b[0] : a[1] - b[1]);
      for (let i = 1; i < points.length; i += 1) {
        expect(Math.abs(points[i][0] - points[i - 1][0])).toBeLessThanOrEqual(1);
        expect(Math.abs(points[i][1] - points[i - 1][1])).toBeLessThanOrEqual(1);
      }
      expect(data.flat().every((pixel) => pixel === null || pixel === color)).toBe(true);
    });

    it("draws the exact pixels of a shallow line", () => {
      const data = initGrid(5);
      applyLine(data, 0, 0, 4, 2, color);
      expect(pixels(data)).toEqual([[0, 0], [1, 1], [2, 1], [3, 2], [4, 2]]);
    });

    it.each([false, true])("draws an inclusive rectangle (filled: %s) in either drag direction", (filled) => {
      const data = initGrid(5);
      const reversed = initGrid(5);
      applyRectangle(data, 1, 1, 3, 3, color, filled);
      applyRectangle(reversed, 3, 3, 1, 1, color, filled);
      expect(data).toEqual(reversed);
      expect(pixels(data)).toHaveLength(filled ? 9 : 8);
      expect(data[2][2]).toBe(filled ? color : null);
      expect(data[0]).toEqual(Array(5).fill(null));
    });

    it("draws an ellipse with a transparent center for outlines and a solid center for fills", () => {
      const outline = initGrid(5), filled = initGrid(5), reversed = initGrid(5);
      applyCircle(outline, 0, 0, 4, 4, color, false);
      applyCircle(filled, 0, 0, 4, 4, color, true);
      applyCircle(reversed, 4, 4, 0, 0, color, false);
      expect(outline).toEqual(reversed);
      expect(outline[2][2]).toBeNull();
      expect(filled[2][2]).toBe(color);
      expect(pixels(outline)).toHaveLength(12);
      expect(pixels(filled)).toHaveLength(21);
      expect(filled[0][0]).toBeNull();
      for (const [x, y] of pixels(filled)) {
        expect(filled[y][4 - x]).toBe(color);
        expect(filled[4 - y][x]).toBe(color);
      }
    });

    it("draws a wide ellipse, not a circle clipped to the smaller dimension", () => {
      const data = initGrid(7);
      applyCircle(data, 0, 2, 6, 4, color, true);
      expect(data[3][0]).toBe(color);
      expect(data[3][6]).toBe(color);
      expect(data[2][0]).toBeNull();
      expect(data[1].every((pixel) => pixel === null)).toBe(true);
      expect(data[5].every((pixel) => pixel === null)).toBe(true);
    });

    it.each([applyLine, (data: ReturnType<typeof initGrid>, x0: number, y0: number, x1: number, y1: number, c: string) =>
      applyRectangle(data, x0, y0, x1, y1, c, false),
    (data: ReturnType<typeof initGrid>, x0: number, y0: number, x1: number, y1: number, c: string) =>
      applyCircle(data, x0, y0, x1, y1, c, false)])(
      "supports a single pixel and rejects invalid endpoints before mutation",
      (draw) => {
        const data = initGrid(3);
        draw(data, 1, 1, 1, 1, color);
        expect(pixels(data)).toEqual([[1, 1]]);
        const before = data.map((row) => [...row]);
        expect(() => draw(data, 0, 0, 3, 2, color)).toThrow(RangeError);
        expect(() => draw(data, 0.5, 0, 2, 2, color)).toThrow(RangeError);
        expect(data).toEqual(before);
      },
    );

    it.each([false, true])("supports one-pixel-wide ellipses and rectangles (filled: %s)", (filled) => {
      const a = initGrid(5), b = initGrid(5);
      applyCircle(a, 2, 0, 2, 4, color, filled);
      applyRectangle(b, 2, 0, 2, 4, color, filled);
      expect(a).toEqual(b);
      expect(pixels(a)).toHaveLength(5);
    });
  });

  describe("symmetry and dithering", () => {
    it("dithers only even checkerboard cells", () => {
      const data = initGrid(4);
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) applyDitherPen(data, x, y, "#ffffff");
      }
      expect(data).toEqual([
        ["#ffffff", null, "#ffffff", null],
        [null, "#ffffff", null, "#ffffff"],
        ["#ffffff", null, "#ffffff", null],
        [null, "#ffffff", null, "#ffffff"],
      ]);
    });

    it("mirrors and erases across both axes with no duplicate center coordinates", () => {
      const data = initGrid(5);
      const both = { horizontal: true, vertical: true };
      applyPencil(data, 0, 1, "#ffffff", both);
      for (const [x, y] of [[0, 1], [4, 1], [0, 3], [4, 3]]) {
        expect(data[y][x]).toBe("#ffffff");
      }
      expect(getMirroredCoordinates(data, 2, 2, both)).toEqual([{ x: 2, y: 2 }]);
      applyEraser(data, 0, 1, both);
      expect(data.flat().every((pixel) => pixel === null)).toBe(true);
    });

    it("supports rectangular grids and independent axes", () => {
      const data = Array.from({ length: 3 }, () => Array<null | string>(6).fill(null));
      applyPencil(data, 1, 0, "#ffffff", { horizontal: true });
      expect(data[0][4]).toBe("#ffffff");
      expect(data[2][1]).toBeNull();
      applyPencil(data, 2, 0, "#ff0000", { vertical: true });
      expect(data[2][2]).toBe("#ff0000");
      expect(data[2][3]).toBeNull();
    });

    it("mirrors dither marks as a unit, preserving symmetry even on even-sized grids", () => {
      const data = initGrid(4);
      applyDitherPen(data, 0, 0, "#ffffff", { horizontal: true });
      expect(data[0]).toEqual(["#ffffff", null, null, "#ffffff"]);
    });

    it("mirrors a filled region after BFS without blocking traversal", () => {
      const data = [[null, null, null, "#000000", "#000000"]];
      applyFloodFill(data, 0, 0, "#ffffff", { horizontal: true });
      expect(data[0]).toEqual(Array(5).fill("#ffffff"));
    });

    it("does not prematurely recolor mirrored bridge pixels during BFS", () => {
      const data = [
        [null, "#000000", null],
        [null, null, null],
        ["#000000", "#000000", null],
      ];
      applyFloodFill(data, 0, 0, "#ffffff", { horizontal: true });
      expect(data[2][2]).toBe("#ffffff");
      expect(data[0][1]).toBe("#000000");
    });

    it("supports symmetry on line and geometric tools", () => {
      const data = initGrid(5);
      applyLine(data, 0, 0, 0, 1, "#ffffff", { horizontal: true });
      expect(data[1][4]).toBe("#ffffff");
      applyRectangle(data, 0, 0, 1, 1, "#ff0000", true, { vertical: true });
      expect(data[4][1]).toBe("#ff0000");
      applyCircle(data, 0, 0, 0, 0, "#abcdef", true, { horizontal: true, vertical: true });
      expect(data[4][4]).toBe("#abcdef");
    });

    it("rejects ragged symmetry grids before mutation", () => {
      const data = [[null, null], [null]];
      expect(() => applyPencil(data, 0, 0, "#ffffff", { vertical: true })).toThrow("rectangular");
      expect(data).toEqual([[null, null], [null]]);
    });
  });

  it("fills connected transparent pixels without crossing barriers or diagonals", () => {
    const data = [
      [null, null, "#000000"],
      [null, "#000000", null],
      ["#000000", null, null],
    ];
    applyFloodFill(data, 0, 0, "#ff0000");
    expect(data).toEqual([
      ["#ff0000", "#ff0000", "#000000"],
      ["#ff0000", "#000000", null],
      ["#000000", null, null],
    ]);
  });

  it("fills a colored region and returns early for the same color", () => {
    const data = [["#ffffff", "#ffffff"], ["#000000", "#ffffff"]];
    applyFloodFill(data, 1, 1, "#ff0000");
    expect(data).toEqual([["#ff0000", "#ff0000"], ["#000000", "#ff0000"]]);
    const before = structuredClone(data);
    applyFloodFill(data, 1, 1, "#ff0000");
    expect(data).toEqual(before);
  });

  it("fills a large grid without recursion", () => {
    const data = initGrid(128);
    applyFloodFill(data, 0, 0, "#ffffff");
    expect(data.flat().every((color) => color === "#ffffff")).toBe(true);
  });

  it.each([[-1, 0], [2, 0], [0, 2], [0.5, 0], [NaN, 0]])(
    "rejects invalid coordinates (%s, %s) without mutation",
    (x, y) => {
      const data = initGrid(2);
      expect(() => applyPencil(data, x, y, null)).toThrow(RangeError);
      expect(() => applyFloodFill(data, x, y, "#ffffff")).toThrow(RangeError);
      expect(() => pickColor(data, x, y)).toThrow(RangeError);
      expect(data).toEqual(initGrid(2));
    },
  );

  it("handles rectangular and ragged rows", () => {
    const data = [[null, null, null], [null]];
    applyFloodFill(data, 0, 0, "#ffffff");
    expect(data).toEqual([["#ffffff", "#ffffff", "#ffffff"], ["#ffffff"]]);
    expect(() => pickColor([], 0, 0)).toThrow(RangeError);
  });
});
