import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { usePackStore } from "./packState";

describe("usePackStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("starts with empty categories and default editor state", () => {
    const store = usePackStore();

    expect(store.categories).toEqual([]);
    expect(store.activeItemId).toBe("");
    expect(store.activeColor).toBe("#ffffff");
    expect(store.activeLayerIndex).toBe(0);
  });

  it("loads categorized texture items from file paths", () => {
    const store = usePackStore();

    store.loadTextures([
      "assets/item/diamond_sword.png",
      "assets/block/oak_log.png",
      "assets/item/iron_sword.png",
    ]);

    expect(store.categories).toEqual([
      {
        id: "swords",
        name: "Swords",
        items: [
          {
            id: "assets/item/diamond_sword.png",
            name: "diamond_sword.png",
            filePath: "assets/item/diamond_sword.png",
            edited: false,
          },
          {
            id: "assets/item/iron_sword.png",
            name: "iron_sword.png",
            filePath: "assets/item/iron_sword.png",
            edited: false,
          },
        ],
      },
      {
        id: "wood-logs",
        name: "Wood Logs",
        items: [
          {
            id: "assets/block/oak_log.png",
            name: "oak_log.png",
            filePath: "assets/block/oak_log.png",
            edited: false,
          },
        ],
      },
    ]);
  });

  it("reports category progress and color for each completion state", () => {
    const store = usePackStore();
    store.loadTextures([
      "assets/item/diamond_sword.png",
      "assets/item/iron_sword.png",
    ]);

    expect(store.categoryProgress("swords")).toEqual({
      total: 2,
      completed: 0,
      formatted: "0/2",
      color: "#ef4444",
    });

    store.markItemEdited("assets/item/diamond_sword.png");
    expect(store.categoryProgress("swords")).toEqual({
      total: 2,
      completed: 1,
      formatted: "1/2",
      color: "#f97316",
    });

    store.markItemEdited("assets/item/iron_sword.png");
    expect(store.categoryProgress("swords")).toEqual({
      total: 2,
      completed: 2,
      formatted: "2/2",
      color: "#22c55e",
    });
  });

  it("returns zero progress for an unknown category", () => {
    const store = usePackStore();

    expect(store.categoryProgress("missing")).toEqual({
      total: 0,
      completed: 0,
      formatted: "0/0",
      color: "#ef4444",
    });
  });

  it("selects an item and marks a matching item as edited", () => {
    const store = usePackStore();
    const itemId = "assets/item/diamond_sword.png";
    store.loadTextures([itemId]);

    store.selectItem(itemId);
    store.markItemEdited(itemId);

    expect(store.activeItemId).toBe(itemId);
    expect(store.categories[0]?.items[0]?.edited).toBe(true);
  });

  it("clears the active item if a later load no longer contains it", () => {
    const store = usePackStore();
    store.loadTextures(["assets/item/diamond_sword.png"]);
    store.selectItem("assets/item/diamond_sword.png");

    store.loadTextures(["assets/item/iron_sword.png"]);

    expect(store.activeItemId).toBe("");
  });
});
