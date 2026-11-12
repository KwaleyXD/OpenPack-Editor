import { describe, expect, it } from "vitest";
import { getTexturePath } from "./texturePaths";

describe("Minecraft texture paths", () => {
  it.each([
    ["item/apple.png", "item", "apple"],
    ["assets/item/apple.png", "item", "apple"],
    ["assets\\minecraft\\textures\\entity\\creeper\\creeper.png", "entity/creeper", "creeper"],
    ["gui/sprites/container/slot.png", "gui/sprites/container", "slot"],
    ["font/unicode_page_00.png", "font", "unicode_page_00"],
  ])("normalizes %s", (source, categoryPath, id) => {
    expect(getTexturePath(source)).toEqual({ categoryPath, id });
  });

  it("preserves non-Minecraft namespaces", () => {
    expect(getTexturePath("assets/example.mod/textures/blocks/stone.png")).toEqual({
      categoryPath: "blocks",
      id: "stone",
      namespace: "example.mod",
    });
  });

  it("supports textures directly inside a namespace texture folder", () => {
    expect(getTexturePath("assets/example/textures/special.png")).toEqual({
      categoryPath: "",
      id: "special",
      namespace: "example",
    });
  });

  it.each([
    "../stone.png", "entity/../stone.png", "/item/stone.png",
    "entity//creeper.png", "stone.png", "item/stone.jpg",
    "item/stone.png/../../evil.png", "item/STONE.png",
  ])("rejects unsafe or invalid paths %s", (source) => {
    expect(() => getTexturePath(source)).toThrow("Cannot determine");
  });
});
