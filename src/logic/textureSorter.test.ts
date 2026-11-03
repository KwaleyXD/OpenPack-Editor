import { describe, expect, it } from "vitest";
import { sortTextures } from "./textureSorter";

describe("sortTextures", () => {
  it("groups matching texture filenames and preserves their input paths", () => {
    const files = [
      "assets/item/diamond_sword.png",
      "assets/block/oak_log.png",
      "assets/item/redstone_dust.png",
      "assets/block/oak_leaves.png",
      "assets/item/stone.png",
      "assets/item/golden_sword.PNG",
    ];

    expect(sortTextures(files)).toEqual([
      {
        category: "Swords",
        files: ["assets/item/diamond_sword.png", "assets/item/golden_sword.PNG"],
      },
      { category: "Wood Logs", files: ["assets/block/oak_log.png"] },
      { category: "Redstone", files: ["assets/item/redstone_dust.png"] },
      { category: "Leaves", files: ["assets/block/oak_leaves.png"] },
      { category: "Other", files: ["assets/item/stone.png"] },
    ]);
  });

  it("matches filenames from Windows paths", () => {
    expect(sortTextures(["assets\\block\\birch_log.png"])).toEqual([
      { category: "Wood Logs", files: ["assets\\block\\birch_log.png"] },
    ]);
  });

  it("returns no groups for an empty asset list", () => {
    expect(sortTextures([])).toEqual([]);
  });

  it("does not mutate the input list", () => {
    const files = Object.freeze(["assets/item/iron_sword.png"]);

    expect(sortTextures(files)).toEqual([
      { category: "Swords", files: ["assets/item/iron_sword.png"] },
    ]);
    expect(files).toEqual(["assets/item/iron_sword.png"]);
  });
});
