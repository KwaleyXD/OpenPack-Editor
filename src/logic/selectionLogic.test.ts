import { describe, expect, it } from "vitest";
import { applySelection, copySelection, magicSelection, rectangleSelection, selectionPath } from "./selectionLogic";

describe("pixel selections", () => {
  it("creates rectangles in either drag direction", () => {
    expect(rectangleSelection(3, 2, 1, 1)).toEqual({ x: 1, y: 1, mask: [[true, true, true], [true, true, true]] });
  });

  it("selects only orthogonally connected matching colors, including transparency", () => {
    const data = [["#fff", null, "#fff"], ["#fff", null, null], [null, "#fff", null]];
    expect(magicSelection(data, 0, 0)).toEqual({ x: 0, y: 0, mask: [[true], [true]] });
    expect(magicSelection(data, 1, 0)).toEqual({
      x: 1, y: 0, mask: [[true, false], [true, true], [false, true]],
    });
  });

  it("moves only masked pixels and leaves destination pixels under transparency intact", () => {
    const data = [["#111", null, "#333", "#444"], ["#aaa", "#bbb", "#ccc", "#ddd"]];
    const selection = rectangleSelection(0, 0, 1, 0);
    const copy = copySelection(data, selection);
    expect(applySelection(data, copy, 2, 0, selection)).toEqual([
      [null, null, "#111", "#444"], ["#aaa", "#bbb", "#ccc", "#ddd"],
    ]);
    expect(data[0]).toEqual(["#111", null, "#333", "#444"]);
    expect(selectionPath({ x: 0, y: 0, mask: [[true, false], [true, true]] })).toContain("M0 0h1");
  });

  it("clips pixels moved past the frame edge", () => {
    const data = [["#111", "#222", "#333"]];
    const selection = rectangleSelection(0, 0, 2, 0);
    const copy = copySelection(data, selection);
    expect(applySelection(data, copy, 1, 0, selection)).toEqual([[null, "#111", "#222"]]);
    expect(applySelection(data, copy, -1, 0, selection)).toEqual([["#222", "#333", null]]);
    expect(copySelection(data, { x: 2, y: 0, mask: [[true, true]] }).pixels).toEqual([["#333", null]]);
  });
});
