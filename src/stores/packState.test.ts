import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePackStore } from "./packState";
import { initGrid, type PixelColor } from "../engine/canvasEngine";
import { parsePngToGrid } from "../engine/imageLoader";

vi.mock("../engine/imageLoader", () => ({ parsePngToGrid: vi.fn() }));

function deferredGrid() {
  let resolve!: (data: PixelColor[][]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<PixelColor[][]>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("usePackStore", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.mocked(parsePngToGrid).mockReset();
    vi.mocked(parsePngToGrid).mockImplementation(async (_url, size) => initGrid(size));
  });

  afterEach(() => {
    usePackStore().$dispose();
    localStorage.clear();
  });

  it("starts with empty categories and default editor state", () => {
    const store = usePackStore();

    expect(store.categories).toEqual([]);
    expect(store.activeItemId).toBe("");
    expect(store.activeColor).toBe("#ffffff");
    expect(store.activeLayerIndex).toBe(0);
    expect(store.packName).toBe("My Custom Pack");
    expect(store.packDescription).toBe("Made in OpenPack Editor");
  });

  it("loads Vanilla Base from an actual item path, then resets history without marking it edited", async () => {
    const store = usePackStore();
    const grid = initGrid(16);
    grid[0][0] = "#ff000080";
    vi.mocked(parsePngToGrid).mockResolvedValueOnce(grid);
    store.loadTextures(["assets\\minecraft\\textures\\item\\diamond_sword.png"]);
    store.saveHistorySnapshot();
    await store.selectItem("assets\\minecraft\\textures\\item\\diamond_sword.png");
    expect(parsePngToGrid).toHaveBeenCalledWith("/vanilla_base/item/diamond_sword.png", 16);
    expect(store.layers).toEqual([
      { id: "layer-0", name: "Vanilla Base", visible: true, data: grid },
    ]);
    expect(store.historyStack).toEqual([]);
    expect(store.redoStack).toEqual([]);
    expect(store.categories[0].items[0].edited).toBe(false);
    expect(store.pendingItemId).toBe("");
  });

  it("uses cached layers without loading PNGs and reloads unedited textures", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "block/dirt.png"]);
    await store.selectItem("block/stone.png");
    store.markItemEdited(store.activeItemId);
    await store.selectItem("block/dirt.png");
    expect(parsePngToGrid).toHaveBeenCalledTimes(2);
    await store.selectItem("block/stone.png");
    expect(parsePngToGrid).toHaveBeenCalledTimes(2);
    await store.selectItem("block/dirt.png");
    expect(parsePngToGrid).toHaveBeenCalledTimes(3);
  });

  it("preserves active data and history on load failure and allows retry", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "block/dirt.png"]);
    await store.selectItem("block/stone.png");
    store.saveHistorySnapshot();
    store.layers[0].data[0][0] = "#123456";
    store.markItemEdited(store.activeItemId);
    const layers = store.layers;
    vi.mocked(parsePngToGrid).mockRejectedValueOnce(new Error("Missing vanilla PNG"));
    await expect(store.selectItem("block/dirt.png")).rejects.toThrow("Missing vanilla PNG");
    expect(store.layers).toBe(layers);
    expect(store.activeItemId).toBe("block/stone.png");
    expect(store.historyStack).toHaveLength(1);
    expect(store.selectionError).toBe("Missing vanilla PNG");
    expect(store.pendingItemId).toBe("");
    await store.selectItem("block/dirt.png");
    expect(store.selectionError).toBe("");
    expect(store.categories[0].items[0].savedLayers![0].data[0][0]).toBe("#123456");
  });

  it("ignores an older load that resolves after the latest selection", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "block/dirt.png"]);
    const first = deferredGrid();
    const second = deferredGrid();
    vi.mocked(parsePngToGrid).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = store.selectItem("block/stone.png");
    const b = store.selectItem("block/dirt.png");
    expect(store.pendingItemId).toBe("block/dirt.png");
    second.resolve(initGrid(16));
    await b;
    first.resolve(initGrid(16));
    await a;
    expect(store.activeItemId).toBe("block/dirt.png");
    expect(store.pendingItemId).toBe("");
  });

  it("ignores superseded failures without clearing the latest loading status", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "block/dirt.png"]);
    const first = deferredGrid();
    const second = deferredGrid();
    vi.mocked(parsePngToGrid).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = store.selectItem("block/stone.png");
    const b = store.selectItem("block/dirt.png");
    first.reject(new Error("Stale failure"));
    await a;
    expect(store.selectionError).toBe("");
    expect(store.pendingItemId).toBe("block/dirt.png");
    second.resolve(initGrid(16));
    await b;
    expect(store.activeItemId).toBe("block/dirt.png");
  });

  it("cancels a pending selection when reselecting the active texture or reloading the pack", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "block/dirt.png"]);
    await store.selectItem("block/stone.png");
    const first = deferredGrid();
    vi.mocked(parsePngToGrid).mockReturnValueOnce(first.promise);
    const pending = store.selectItem("block/dirt.png");
    await store.selectItem("block/stone.png");
    first.resolve(initGrid(16));
    await pending;
    expect(store.activeItemId).toBe("block/stone.png");
    const second = deferredGrid();
    vi.mocked(parsePngToGrid).mockReturnValueOnce(second.promise);
    const next = store.selectItem("block/dirt.png");
    store.loadTextures(["block/grass_block.png"]);
    second.resolve(initGrid(16));
    await next;
    expect(store.activeItemId).toBe("");
    expect(store.pendingItemId).toBe("");
  });

  it("caches edits made while the next texture loads", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "block/dirt.png"]);
    await store.selectItem("block/stone.png");
    const deferred = deferredGrid();
    vi.mocked(parsePngToGrid).mockReturnValueOnce(deferred.promise);
    const pending = store.selectItem("block/dirt.png");
    store.layers[0].data[0][0] = "#abcdef";
    store.markItemEdited(store.activeItemId);
    deferred.resolve(initGrid(16));
    await pending;
    expect(store.categories[0].items[0].savedLayers![0].data[0][0]).toBe("#abcdef");
  });

  it("caches only edited textures and restores isolated data and dimensions", async () => {
    const store = usePackStore();
    const a = "assets/minecraft/textures/block/stone.png";
    const b = "assets/minecraft/textures/item/diamond_sword.png";
    store.loadTextures([a, b]);
    await store.selectItem(a);
    store.layers[0].data[0][0] = "#123456";
    store.markItemEdited(a);
    store.resizeCanvas(32);
    const previousLayers = store.layers;
    await store.selectItem(b);
    const cached = store.categories[0].items[0].savedLayers!;
    expect(cached).not.toBe(previousLayers);
    previousLayers[0].data[0][0] = "#abcdef";
    expect(cached[0].data[0][0]).toBe("#123456");
    expect(store.width).toBe(16);
    expect(store.layers[0].data[0][0]).toBeNull();
    expect(store.historyStack).toEqual([]);
    expect(store.redoStack).toEqual([]);
    await store.selectItem(a);
    expect([store.width, store.height]).toEqual([32, 32]);
    expect(store.layers[0].data[0][0]).toBe("#123456");
    expect(store.categories[0].items[0].savedLayers).toBeUndefined();
    expect(store.categories[1].items[0].savedLayers).toBeUndefined();
    store.layers[0].data[0][0] = "#ffffff";
    expect(cached[0].data[0][0]).toBe("#123456");
  });

  it("keeps live edits and history when reselecting the same item", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png"]);
    await store.selectItem("block/stone.png");
    store.saveHistorySnapshot();
    store.layers[0].data[0][0] = "#ffffff";
    await store.selectItem("block/stone.png");
    expect(store.layers[0].data[0][0]).toBe("#ffffff");
    expect(store.historyStack).toHaveLength(1);
    await expect(store.selectItem("missing.png")).rejects.toThrow("does not exist");
    expect(store.activeItemId).toBe("block/stone.png");
  });

  it("exports only edited items using live and cached layers with real Minecraft paths", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "item/diamond_sword.png", "block/dirt.png"]);
    await store.selectItem("block/stone.png");
    store.layers[0].data[0][0] = "#123456";
    store.markItemEdited(store.activeItemId);
    await store.selectItem("item/diamond_sword.png");
    store.layers[0].data[0][0] = "#abcdef";
    store.markItemEdited(store.activeItemId);
    const items = store.getEditedItems();
    expect(items.map(({ id, categoryPath }) => ({ id, categoryPath }))).toEqual([
      { id: "stone", categoryPath: "block" },
      { id: "diamond_sword", categoryPath: "item" },
    ]);
    expect(items[0].layers[0].data[0][0]).toBe("#123456");
    expect(items[1].layers).toBe(store.layers);
    expect(items[1].layers[0].data[0][0]).toBe("#abcdef");
  });

  it("reports missing cached data and ambiguous texture paths", async () => {
    const store = usePackStore();
    store.loadTextures(["stone.png"]);
    store.markItemEdited("stone.png");
    expect(() => store.getEditedItems()).toThrow("no saved pixel data");
    await expect(store.selectItem("stone.png")).rejects.toThrow("Cannot determine");
  });

  it("resizes all layers, updates dimensions and supports resize undo/redo", () => {
    const store = usePackStore();
    store.addLayer();
    store.layers[0].data[1][2] = "#123456";
    store.layers[1].visible = false;
    store.layers[1].data[15][15] = "#abcdef";
    store.resizeCanvas(32);
    expect([store.width, store.height]).toEqual([32, 32]);
    expect(store.layers[0].data[2].slice(4, 6)).toEqual(["#123456", "#123456"]);
    expect(store.layers[0].data[3].slice(4, 6)).toEqual(["#123456", "#123456"]);
    expect(store.layers[1].data[31][31]).toBe("#abcdef");
    expect(store.layers[1].visible).toBe(false);
    store.resizeCanvas(32);
    expect(store.historyStack).toHaveLength(2);
    store.undo();
    expect([store.width, store.height]).toEqual([16, 16]);
    expect(store.layers[0].data[1][2]).toBe("#123456");
    store.redo();
    expect([store.width, store.height]).toEqual([32, 32]);
    store.addLayer();
    expect(store.layers[2].data).toHaveLength(32);
    expect(() => store.resizeCanvas(0)).toThrow(RangeError);
    expect(store.width).toBe(32);
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
        name: "Wood & Logs",
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

  it("selects an item and marks a matching item as edited", async () => {
    const store = usePackStore();
    const itemId = "assets/item/diamond_sword.png";
    store.loadTextures([itemId]);

    await store.selectItem(itemId);
    store.markItemEdited(itemId);

    expect(store.activeItemId).toBe(itemId);
    expect(store.categories[0]?.items[0]?.edited).toBe(true);
  });

  it("clears the active item if a later load no longer contains it", async () => {
    const store = usePackStore();
    store.loadTextures(["assets/item/diamond_sword.png"]);
    await store.selectItem("assets/item/diamond_sword.png");

    store.loadTextures(["assets/item/iron_sword.png"]);

    expect(store.activeItemId).toBe("");
  });

  it("restores serialized layers through undo and redo without shared references", () => {
    const store = usePackStore();
    expect(store.historyStack).toEqual([]);
    expect(store.redoStack).toEqual([]);
    const originalLayers = store.layers;
    store.saveHistorySnapshot();
    store.layers[0].data[0][0] = "#123456";
    store.saveHistorySnapshot();
    store.layers[0].data[0][1] = "#abcdef";

    store.undo();
    expect(store.layers[0].data[0]).toEqual(["#123456", ...Array(15).fill(null)]);
    store.undo();
    expect(store.layers[0].data[0][0]).toBeNull();
    expect(store.layers).not.toBe(originalLayers);
    expect(originalLayers[0].data[0][1]).toBe("#abcdef");
    store.redo();
    expect(store.layers[0].data[0][0]).toBe("#123456");
    expect(store.layers[0].data[0][1]).toBeNull();
    store.redo();
    expect(store.layers[0].data[0][1]).toBe("#abcdef");
    expect(store.redoStack).toEqual([]);
  });

  it("clears redo when a new edit begins after undo", () => {
    const store = usePackStore();
    store.saveHistorySnapshot();
    store.layers[0].data[0][0] = "#123456";
    store.undo();
    expect(store.redoStack).toHaveLength(1);
    store.saveHistorySnapshot();
    store.layers[0].data[0][0] = "#abcdef";
    store.redo();
    expect(store.redoStack).toEqual([]);
    expect(store.layers[0].data[0][0]).toBe("#abcdef");
  });

  it("keeps exactly the 30 most recent steps through undo and redo", () => {
    const store = usePackStore();
    for (let step = 0; step < 35; step += 1) {
      store.saveHistorySnapshot();
      store.layers[0].name = `Step ${step + 1}`;
    }
    expect(store.historyStack).toHaveLength(30);
    for (let step = 0; step < 30; step += 1) {
      store.undo();
    }
    expect(store.layers[0].name).toBe("Step 5");
    expect(store.redoStack).toHaveLength(30);
    store.undo();
    expect(store.layers[0].name).toBe("Step 5");
    for (let step = 0; step < 30; step += 1) {
      store.redo();
    }
    expect(store.layers[0].name).toBe("Step 35");
    expect(store.historyStack).toHaveLength(30);
    store.redo();
    expect(store.layers[0].name).toBe("Step 35");
  });

  it("does nothing when history is empty", () => {
    const store = usePackStore();
    const layers = store.layers;
    store.undo();
    store.redo();
    expect(store.layers).toBe(layers);
    expect(store.historyStack).toEqual([]);
    expect(store.redoStack).toEqual([]);
  });

  it("restores visibility and keeps the selected layer index in bounds", () => {
    const store = usePackStore();
    store.saveHistorySnapshot();
    store.addLayer();
    store.layers[0].visible = false;
    store.undo();
    expect(store.layers).toHaveLength(1);
    expect(store.activeLayerIndex).toBe(0);
    expect(store.layers[0].visible).toBe(true);
    store.redo();
    expect(store.layers).toHaveLength(2);
    expect(store.layers[0].visible).toBe(false);
  });

  it("adds a rectangular blank layer and makes addition undoable", () => {
    const store = usePackStore();
    store.width = 3;
    store.height = 2;
    store.addLayer();
    expect(store.layers[1].data).toEqual([[null, null, null], [null, null, null]]);
    expect(store.activeLayerIndex).toBe(1);
    expect(store.historyStack).toHaveLength(1);
    store.undo();
    expect(store.layers).toHaveLength(1);
    store.redo();
    expect(store.layers).toHaveLength(2);
  });

  it("preserves the selected layer identity when other layers move or are deleted", () => {
    const store = usePackStore();
    store.addLayer();
    store.addLayer();
    store.activeLayerIndex = 1;
    const activeId = store.layers[1].id;
    const originalOrder = store.layers.map(({ id }) => id);
    store.moveLayer(0, 2);
    expect(store.layers.map(({ id }) => id)).toEqual([
      originalOrder[1], originalOrder[2], originalOrder[0],
    ]);
    expect(store.layers[store.activeLayerIndex].id).toBe(activeId);
    store.undo();
    expect(store.layers.map(({ id }) => id)).toEqual(originalOrder);
    store.redo();
    store.deleteLayer(2);
    expect(store.layers[store.activeLayerIndex].id).toBe(activeId);
    store.deleteLayer(0);
    expect(store.layers).toHaveLength(1);
    expect(store.activeLayerIndex).toBe(0);
    const steps = store.historyStack.length;
    store.deleteLayer(0);
    store.moveLayer(0, 0);
    expect(store.historyStack).toHaveLength(steps);
    expect(store.layers).toHaveLength(1);
    store.undo();
    expect(store.layers).toHaveLength(2);
  });

  it("adjusts selection when deleting lower layers or the selected top layer", () => {
    const store = usePackStore();
    store.addLayer();
    store.addLayer();
    const activeId = store.layers[2].id;
    store.deleteLayer(0);
    expect(store.activeLayerIndex).toBe(1);
    expect(store.layers[1].id).toBe(activeId);
    store.deleteLayer(1);
    expect(store.activeLayerIndex).toBe(0);
  });

  it("marks layer operations edited so they survive caching and export", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "block/dirt.png"]);
    await store.selectItem("block/stone.png");
    store.addLayer();
    expect(store.categories[0].items[0].edited).toBe(true);
    store.categories[0].items[0].edited = false;
    store.moveLayer(1, 0);
    expect(store.categories[0].items[0].edited).toBe(true);
    store.categories[0].items[0].edited = false;
    store.toggleLayerVisibility(0);
    expect(store.categories[0].items[0].edited).toBe(true);
    store.undo();
    expect(store.layers[0].visible).toBe(true);
    store.redo();
    expect(store.layers[0].visible).toBe(false);
    store.categories[0].items[0].edited = false;
    store.deleteLayer(0);
    expect(store.categories[0].items[0].edited).toBe(true);
    await store.selectItem("block/dirt.png");
    expect(store.categories[0].items[0].savedLayers).toHaveLength(1);
  });

  it.each([-1, 1, 0.5, NaN])("rejects invalid layer index %s without history mutations", (index) => {
    const store = usePackStore();
    expect(() => store.deleteLayer(index)).toThrow(RangeError);
    expect(() => store.moveLayer(index, 0)).toThrow(RangeError);
    expect(() => store.moveLayer(0, index)).toThrow(RangeError);
    expect(() => store.toggleLayerVisibility(index)).toThrow(RangeError);
    expect(store.historyStack).toEqual([]);
    expect(store.layers).toHaveLength(1);
  });
});
