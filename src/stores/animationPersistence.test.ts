import { createPinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePackStore } from "./packState";
import { parsePngToGrid } from "../engine/imageLoader";
import { parseProject } from "./projectPersistence";

vi.mock("../engine/imageLoader", () => ({
  parsePngToGrid: vi.fn(async (_url: string, width: number, height = width) =>
    Array.from({ length: height }, () => Array<null>(width).fill(null))),
}));

describe("animation persistence and category migration", () => {
  const stores: ReturnType<typeof usePackStore>[] = [];
  function createStore() {
    const store = usePackStore(createPinia());
    stores.push(store);
    return store;
  }
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    stores.splice(0).forEach((store) => store.$dispose());
    vi.mocked(parsePngToGrid).mockClear();
    localStorage.clear();
  });

  it("regroups an existing save without losing edited sheets or the selected frame", async () => {
    const store = createStore();
    store.loadTextures(["block/lantern.png", "block/oak_log_top.png", "item/iron_ingot.png"]);
    await store.selectItem("block/lantern.png");
    store.layers[0].data[32][0] = "#abcdef";
    store.markItemEdited(store.activeItemId);
    store.selectFrame(2);
    store.saveProjectLocal();
    const saved = JSON.parse(localStorage.getItem("openpack_save")!);
    saved.categories = [{ id: "old-other", name: "Old Other", items: saved.categories.flatMap((category: { items: unknown[] }) => category.items) }];
    localStorage.setItem("openpack_save", JSON.stringify(saved));
    const restored = createStore();
    expect(restored.persistenceError).toBe("");
    expect(restored.activeFrameIndex).toBe(2);
    expect(restored.frameLayers[0].data[0][0]).toBe("#abcdef");
    expect(restored.categories.map(({ name }) => name)).toEqual(["Decor & Storage", "Wood & Logs", "Ores"]);
    expect(restored.getEditedItems()[0]).toMatchObject({ width: 16, height: 48 });
    expect(restored.getEditedItems()[0].layers[0].data[32][0]).toBe("#abcdef");
  });

  it("resolves animation metadata by file path even when an asset uses a different ID", async () => {
    const store = createStore();
    store.loadTextures(["block/lantern.png"]);
    store.categories[0].items[0].id = "custom-animation-id";
    await store.selectItem("custom-animation-id");
    store.selectFrame(2);
    expect(store.frameRect.y).toBe(32);
    store.saveProjectLocal();
    const restored = createStore();
    expect(restored.activeItemId).toBe("custom-animation-id");
    expect(restored.activeFrameIndex).toBe(2);
    expect(restored.frameHeight).toBe(16);
    expect(restored.persistenceError).toBe("");
  });

  it("opens legacy saves at the first animation frame and rejects out-of-range frame selection", async () => {
    const store = createStore();
    store.loadTextures(["block/lantern.png"]);
    await store.selectItem("block/lantern.png");
    store.saveProjectLocal();
    const saved = JSON.parse(localStorage.getItem("openpack_save")!);
    delete saved.activeFrameIndex;
    expect(parseProject(JSON.stringify(saved)).activeFrameIndex).toBe(0);
    saved.activeFrameIndex = 99;
    expect(() => parseProject(JSON.stringify(saved))).toThrow("invalid selected animation frame");
    expect(() => store.selectFrame(-1)).toThrow(RangeError);
    expect(store.activeFrameIndex).toBe(0);
    store.loadTextures(["block/stone.png"]);
    expect(() => store.selectFrame(0)).toThrow("no animation frames");
  });

  it("restores opacity for active and cached layers, accepts legacy layers, and rejects invalid values", async () => {
    const store = createStore();
    store.loadTextures(["block/stone.png", "block/dirt.png"]);
    await store.selectItem("block/stone.png");
    store.setLayerOpacity(0, 0.35);
    await store.selectItem("block/dirt.png");
    store.setLayerOpacity(0, 0);
    store.saveProjectLocal();
    const serialized = localStorage.getItem("openpack_save")!;
    const restored = createStore();
    expect(restored.layers[0].opacity).toBe(0);
    await restored.selectItem("block/stone.png");
    expect(restored.layers[0].opacity).toBe(0.35);

    const saved = JSON.parse(serialized);
    const items = saved.categories.flatMap((category: { items: unknown[] }) => category.items);
    const active = items.find((item: { id: string }) => item.id === "block/dirt.png");
    const cached = items.find((item: { id: string }) => item.id === "block/stone.png");
    delete active.savedLayers[0].opacity;
    delete cached.savedLayers[0].opacity;
    expect(parseProject(JSON.stringify(saved)).layers[0].opacity ?? 1).toBe(1);
    active.savedLayers[0].opacity = 1.1;
    expect(() => parseProject(JSON.stringify(saved))).toThrow();
    delete active.savedLayers[0].opacity;
    cached.savedLayers[0].opacity = -0.1;
    expect(() => parseProject(JSON.stringify(saved))).toThrow();
  });
});
