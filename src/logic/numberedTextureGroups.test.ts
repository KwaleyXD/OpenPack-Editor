import { describe, expect, it } from "vitest";
import { groupNumberedTextures } from "./numberedTextureGroups";

describe("numbered texture groups", () => {
  it("groups only recognized item sequences in numeric order", () => {
    const items = [
      "item/clock_10.png", "item/clock_02.png", "item/compass_01.png",
      "item/compass_00.png", "item/recovery_compass_01.png", "item/recovery_compass_00.png",
      "block/clock_00.png", "item/bow_pulling_0.png", "item/bow_pulling_1.png",
    ].map((filePath) => ({ filePath }));
    const groups = groupNumberedTextures(items);
    expect(groups.map(({ name }) => name)).toEqual(["clock.png", "compass.png", "recovery_compass.png"]);
    expect(groups[0].frames.map(({ filePath }) => filePath)).toEqual(["item/clock_02.png", "item/clock_10.png"]);
  });

  it("does not group a single frame or ambiguous duplicate frame numbers", () => {
    expect(groupNumberedTextures([{ filePath: "item/clock_00.png" }])).toEqual([]);
    expect(groupNumberedTextures([
      { filePath: "item/clock_00.png" }, { filePath: "item/clock_0.png" },
    ])).toEqual([]);
  });
});
