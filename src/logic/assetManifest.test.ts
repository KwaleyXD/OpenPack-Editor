import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_TEXTURE_PATHS, DEFAULT_TEXTURES } from "./assetManifest";
import { sortTextures } from "./textureSorter";
import { getTexturePath } from "./texturePaths";

describe("imported default asset manifest", () => {
  it("contains every PNG texture from the supplied template with unique, exportable paths", () => {
    expect(DEFAULT_TEXTURE_PATHS).toHaveLength(3964);
    expect(new Set(DEFAULT_TEXTURE_PATHS).size).toBe(DEFAULT_TEXTURE_PATHS.length);
    for (const path of DEFAULT_TEXTURE_PATHS) {
      const { id, categoryPath } = getTexturePath(path);
      expect(`${categoryPath}/${id}.png`).toBe(path);
    }
  });

  it("populates existing categories and dedicated folders for other Minecraft texture types", () => {
    const categories = sortTextures(DEFAULT_TEXTURE_PATHS).map(({ category }) => category);
    expect(categories).toEqual(expect.arrayContaining([
      "Swords", "Pickaxes", "Axes", "Shovels & Hoes", "Armor",
      "Stone & Deepslate", "Wood & Logs", "Leaves & Foliage",
      "Redstone Components", "Food & Consumables",
      "Entity Textures", "GUI Textures", "Particle Textures",
      "Colormap Textures", "Font Textures", "Trims",
      "Shelf", "Candle", "Coral", "Planks", "End Stuff", "Spear", "Ores", "Spawn Eggs & Eggs",
    ]));
    const groups = sortTextures(DEFAULT_TEXTURE_PATHS);
    expect(groups.flatMap(({ files }) => files)).toHaveLength(3964);
    expect(groups.find(({ category }) => category === "Entity Textures")?.files).toContain("entity/creeper/creeper.png");
  });

  it("ships every PNG at its manifest dimensions and keeps its metadata sidecar intact", () => {
    for (const texture of DEFAULT_TEXTURES) {
      const file = resolve("public/vanilla_base", texture.path);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.readUInt32BE(16)).toBe(texture.width);
      expect(bytes.readUInt32BE(20)).toBe(texture.height);
      if (texture.metadata !== undefined) {
        expect(readFileSync(`${file}.mcmeta`, "utf8")).toBe(texture.metadata);
        expect(() => JSON.parse(texture.metadata!)).not.toThrow();
      }
    }
  });
});
