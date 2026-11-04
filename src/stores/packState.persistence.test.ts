import { createPinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initGrid } from "../engine/canvasEngine";
import { parsePngToGrid } from "../engine/imageLoader";
import { usePackStore } from "./packState";

vi.mock("../engine/imageLoader", () => ({
  parsePngToGrid: vi.fn(async (_url: string, size: number) => initGrid(size)),
}));

describe("local project persistence", () => {
  let stores: ReturnType<typeof usePackStore>[];

  function createStore() {
    const store = usePackStore(createPinia());
    stores.push(store);
    return store;
  }

  beforeEach(() => {
    localStorage.clear();
    stores = [];
    vi.useFakeTimers();
    vi.mocked(parsePngToGrid).mockClear();
  });

  afterEach(() => {
    for (const store of stores) {
      store.$dispose();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("debounces pixel and metadata edits by exactly one second", async () => {
    const store = createStore();
    const save = vi.spyOn(Storage.prototype, "setItem");
    store.layers[0].data[0][0] = "#123456";
    await nextTick();
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    store.packName = "Latest name";
    store.packDescription = "Latest description";
    store.layers[0].data[1][1] = "#abcdef80";
    await nextTick();
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe("openpack_save");
    const saved = JSON.parse(localStorage.getItem("openpack_save")!);
    expect(saved.packName).toBe("Latest name");
    expect(saved.packDescription).toBe("Latest description");
    expect(saved.canvasLayers[0].data[1][1]).toBe("#abcdef80");
  });

  it("includes the unswitched active edit in categories without modifying the live cache", async () => {
    const store = createStore();
    store.loadTextures(["block/stone.png"]);
    await store.selectItem("block/stone.png");
    store.layers[0].data[0][0] = "#12345680";
    store.markItemEdited(store.activeItemId);
    expect(store.categories[0].items[0].savedLayers).toBeUndefined();
    expect(store.saveProjectLocal()).toBe(true);
    const saved = JSON.parse(localStorage.getItem("openpack_save")!);
    expect(saved.categories[0].items[0].savedLayers[0].data[0][0]).toBe("#12345680");
    expect(saved.canvasLayers).toBeUndefined();
    expect(store.categories[0].items[0].savedLayers).toBeUndefined();

    const restored = createStore();
    expect(restored.activeItemId).toBe("block/stone.png");
    expect(restored.layers[0].data[0][0]).toBe("#12345680");
    expect(restored.categories[0].items[0].savedLayers).toBeUndefined();
    expect(restored.getEditedItems()[0].layers[0].data[0][0]).toBe("#12345680");
    expect(parsePngToGrid).toHaveBeenCalledOnce();
    restored.layers[0].data[0][0] = "#ffffff";
    expect(store.layers[0].data[0][0]).toBe("#12345680");
  });

  it("restores inactive caches, resolution, selection, metadata, visibility and onion settings", async () => {
    const store = createStore();
    store.packName = "My saved pack";
    store.packDescription = "Saved description";
    store.loadTextures(["block/stone.png", "item/diamond_sword.png"]);
    await store.selectItem("block/stone.png");
    store.layers[0].data[1][1] = "#ff000080";
    store.resizeCanvas(32);
    await store.selectItem("item/diamond_sword.png");
    store.addLayer();
    store.layers[1].data[0][0] = "#abcdef";
    store.layers[0].visible = false;
    store.onionSkinRange = 2;
    store.saveProjectLocal();
    const restored = createStore();
    expect(restored.packName).toBe("My saved pack");
    expect(restored.packDescription).toBe("Saved description");
    expect(restored.activeLayerIndex).toBe(1);
    expect(restored.onionSkinRange).toBe(2);
    expect(restored.layers[0].visible).toBe(false);
    expect(restored.layers[1].data[0][0]).toBe("#abcdef");
    expect([restored.width, restored.height]).toEqual([16, 16]);
    expect(restored.historyStack).toEqual([]);
    expect(restored.redoStack).toEqual([]);
    expect(restored.pendingItemId).toBe("");
    await restored.selectItem("block/stone.png");
    expect([restored.width, restored.height]).toEqual([32, 32]);
    expect(restored.layers[0].data[2][2]).toBe("#ff000080");
    expect(restored.getEditedItems()).toHaveLength(2);
  });

  it("preserves an unedited loaded base without turning it into an edited texture", async () => {
    const store = createStore();
    store.loadTextures(["block/stone.png"]);
    await store.selectItem("block/stone.png");
    store.layers[0].data[0][0] = "#abcdef80";
    store.saveProjectLocal();
    const restored = createStore();
    expect(restored.layers[0].name).toBe("Vanilla Base");
    expect(restored.layers[0].data[0][0]).toBe("#abcdef80");
    expect(restored.categories[0].items[0].edited).toBe(false);
    expect(restored.getEditedItems()).toEqual([]);
  });

  it.each(["pagehide", "beforeunload"])("flushes a pending save on %s without duplicate timers", async (eventName) => {
    const store = createStore();
    const save = vi.spyOn(Storage.prototype, "setItem");
    store.layers[0].data[0][0] = "#123456";
    await nextTick();
    window.dispatchEvent(new Event(eventName));
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("openpack_save")!).canvasLayers[0].data[0][0]).toBe("#123456");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushes when the document becomes hidden", async () => {
    const store = createStore();
    store.packName = "Background save";
    await nextTick();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(JSON.parse(localStorage.getItem("openpack_save")!).packName).toBe("Background save");
  });

  it("initializes persistence only once per store and releases listeners and debounce on disposal", async () => {
    const pinia = createPinia();
    const store = usePackStore(pinia);
    stores.push(store);
    const save = vi.spyOn(Storage.prototype, "setItem");
    expect(usePackStore(pinia)).toBe(store);
    store.packName = "Save once";
    await nextTick();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    store.packName = "Do not save after disposal";
    await nextTick();
    store.$dispose();
    stores = [];
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("shows write/quota failures without losing data and supports manual retry", () => {
    const store = createStore();
    store.packName = "Keep my work";
    const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    expect(store.saveProjectLocal()).toBe(false);
    expect(store.persistenceError).toContain("Unable to save project locally");
    expect(store.packName).toBe("Keep my work");
    save.mockRestore();
    expect(store.saveProjectLocal()).toBe(true);
    expect(store.persistenceError).toBe("");
  });

  it("reports unavailable storage on startup", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    const store = createStore();
    expect(store.persistenceError).toContain("Storage blocked");
    expect(store.layers).toHaveLength(1);
  });

  it.each(["not JSON", "null", '{"version":99}', '{"version":1,"categories":[]}'])(
    "does not partially hydrate or overwrite invalid save %s",
    async (saved) => {
      localStorage.setItem("openpack_save", saved);
      const store = createStore();
      expect(store.persistenceError).toContain("Unable to restore project locally");
      expect(store.categories).toEqual([]);
      expect(store.packName).toBe("My Custom Pack");
      window.dispatchEvent(new Event("beforeunload"));
      await vi.advanceTimersByTimeAsync(1000);
      expect(localStorage.getItem("openpack_save")).toBe(saved);
    },
  );

  it.each(["missing-cache", "invalid-pixels", "ragged-grid", "bad-index", "bad-range", "duplicate-item"])(
    "rejects inconsistent saved data: %s",
    (kind) => {
      const source = createStore();
      source.saveProjectLocal();
      const saved = JSON.parse(localStorage.getItem("openpack_save")!);
      if (kind === "missing-cache") {
        saved.categories = [{ id: "stone", name: "Stone", items: [
          { id: "block/stone.png", name: "stone.png", filePath: "block/stone.png", edited: true },
        ] }];
      } else if (kind === "invalid-pixels") {
        saved.canvasLayers[0].data[0][0] = "not-a-color";
      } else if (kind === "ragged-grid") {
        saved.canvasLayers[0].data[0].pop();
      } else if (kind === "bad-index") {
        saved.activeLayerIndex = 99;
      } else if (kind === "bad-range") {
        saved.onionSkinRange = 4;
      } else {
        const item = { id: "block/stone.png", name: "stone.png", filePath: "block/stone.png", edited: false };
        saved.categories = [{ id: "stone", name: "Stone", items: [item, item] }];
      }
      localStorage.setItem("openpack_save", JSON.stringify(saved));
      const restored = createStore();
      expect(restored.persistenceError).toContain("Unable to restore");
      expect(restored.categories).toEqual([]);
    },
  );
});
