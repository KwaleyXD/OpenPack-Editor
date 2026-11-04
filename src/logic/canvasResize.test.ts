import { describe, expect, it } from "vitest";
import { CANVAS_ANCHORS, resizeLayer } from "./canvasResize";
import type { PixelColor } from "../engine/canvasEngine";

describe("anchored canvas resizing", () => {
  const source = [["#ff000080", "#00ff00"], [null, "#0000ff"]];

  it.each(CANVAS_ANCHORS)("pads using the %s anchor without modifying source pixels", (anchor) => {
    const index = CANVAS_ANCHORS.indexOf(anchor);
    const x = index % 3, y = Math.floor(index / 3);
    const resized = resizeLayer(source, 4, 4, anchor, false);
    expect(resized[y][x]).toBe("#ff000080");
    expect(resized[y + 1][x + 1]).toBe("#0000ff");
    expect(resized.flat().filter((color) => color !== null)).toHaveLength(3);
    resized[y][x] = null;
    expect(source[0][0]).toBe("#ff000080");
  });

  it.each(CANVAS_ANCHORS)("crops using the %s anchor", (anchor) => {
    const data: PixelColor[][] = Array.from({ length: 4 }, (_, y) =>
      Array.from({ length: 4 }, (_, x) => `#${y}${x}0000`));
    const index = CANVAS_ANCHORS.indexOf(anchor);
    const x = index % 3, y = Math.floor(index / 3);
    const resized = resizeLayer(data, 2, 2, anchor, false);
    expect(resized).toEqual([data[y].slice(x, x + 2), data[y + 1].slice(x, x + 2)]);
  });

  it("defines centered odd-sized padding/cropping with floor offsets", () => {
    expect(resizeLayer([["#ffffff"]], 2, 2, "center", false))
      .toEqual([["#ffffff", null], [null, null]]);
    expect(resizeLayer(source, 1, 1, "center", false)).toEqual([["#0000ff"]]);
  });

  it("scales rectangular layers independently in each dimension and ignores anchors", () => {
    const resized = resizeLayer(source, 4, 6, "bottom-right", true);
    expect(resized).toEqual([
      ["#ff000080", "#ff000080", "#00ff00", "#00ff00"],
      ["#ff000080", "#ff000080", "#00ff00", "#00ff00"],
      ["#ff000080", "#ff000080", "#00ff00", "#00ff00"],
      [null, null, "#0000ff", "#0000ff"],
      [null, null, "#0000ff", "#0000ff"],
      [null, null, "#0000ff", "#0000ff"],
    ]);
    expect(resizeLayer(resized, 2, 2, "top-left", true)).toEqual(source);
  });

  it("supports custom sizes larger than 64 with no shared rows", () => {
    const resized = resizeLayer([["#ffffff"]], 80, 65, "center", true);
    expect(resized).toHaveLength(65);
    expect(resized.every((row) => row.length === 80 && row.every((color) => color === "#ffffff"))).toBe(true);
    resized[0][0] = null;
    expect(resized[1][0]).toBe("#ffffff");
  });

  it.each([0, -1, 0.5, NaN, Infinity])("rejects invalid dimension %s", (size) => {
    expect(() => resizeLayer(source, size, 4, "center", false)).toThrow(RangeError);
    expect(() => resizeLayer(source, 4, size, "center", true)).toThrow(RangeError);
    expect(source[0][0]).toBe("#ff000080");
  });

  it("rejects ragged or empty grids", () => {
    expect(() => resizeLayer([], 2, 2, "center", false)).toThrow("rectangular");
    expect(() => resizeLayer([[null], []], 2, 2, "center", true)).toThrow("rectangular");
  });
});
