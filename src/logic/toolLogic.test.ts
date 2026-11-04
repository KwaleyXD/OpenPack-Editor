import { describe, expect, it } from "vitest";
import { initGrid } from "../engine/canvasEngine";
import { applyFloodFill, applyPencil, pickColor } from "./toolLogic";

describe("drawing tools", () => {
  it("pencils and erases exactly the requested pixel", () => {
    const data = initGrid(2);
    applyPencil(data, 1, 0, "#123456");
    expect(data).toEqual([[null, "#123456"], [null, null]]);
    expect(pickColor(data, 1, 0)).toBe("#123456");
    applyPencil(data, 1, 0, null);
    expect(pickColor(data, 1, 0)).toBeNull();
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
