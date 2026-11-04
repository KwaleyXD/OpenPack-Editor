import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { usePackStore } from "./packState";
import { createNewPack } from "../logic/packInitializer";
import { DEFAULT_TEXTURE_PATHS } from "../logic/assetManifest";
import { DEFAULT_TEXTURE_BY_PATH } from "../logic/assetManifest";
import { initGrid, type PixelColor } from "../engine/canvasEngine";
import { parsePngToGrid } from "../engine/imageLoader";

vi.mock("../engine/imageLoader", () => ({ parsePngToGrid: vi.fn() }));

describe("pack workflow actions", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.mocked(parsePngToGrid).mockReset();
    vi.mocked(parsePngToGrid).mockImplementation(async (_url, size) => initGrid(size));
  });

  afterEach(() => {
    usePackStore().$dispose();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("resizes every layer, keeps metadata and selection, and restores dimensions through undo/redo", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "item/apple.png"]);
    await store.selectItem("block/stone.png");
    store.layers[0].data[0][0] = "#12345680";
    store.addLayer();
    store.layers[1].data[15][15] = "#abcdef";
    store.layers[1].visible = false;
    store.historyStack = [];
    store.resizeCanvasAdvanced(32, 24, "bottom-right", false);
    expect(store.historyStack).toHaveLength(1);
    expect([store.width, store.height]).toEqual([32, 24]);
    expect(store.activeLayerIndex).toBe(1);
    expect(store.layers[0].data[8][16]).toBe("#12345680");
    expect(store.layers[1].data[23][31]).toBe("#abcdef");
    expect(store.layers[1].visible).toBe(false);
    expect(store.getEditedItems()[0]).toMatchObject({ width: 32, height: 24 });
    store.undo();
    expect([store.width, store.height]).toEqual([16, 16]);
    expect(store.layers[0].data[0][0]).toBe("#12345680");
    store.redo();
    expect([store.width, store.height]).toEqual([32, 24]);
    await store.selectItem("item/apple.png");
    await store.selectItem("block/stone.png");
    expect([store.width, store.height]).toEqual([32, 24]);
    expect(store.layers[1].data[23][31]).toBe("#abcdef");
    store.resizeCanvas(16);
    expect([store.width, store.height]).toEqual([16, 16]);
  });

  it.each([
    "entity/creeper/creeper.png",
    "gui/title/minecraft.png",
    "block/lava_still.png",
    "font/accented.png",
    "item/bundle.png",
  ])("opens default %s at native dimensions and retains its export path and metadata", async (path) => {
    const store = usePackStore();
    const source = DEFAULT_TEXTURE_BY_PATH.get(path)!;
    expect(source).toBeDefined();
    vi.mocked(parsePngToGrid).mockImplementationOnce(async (_url, width, height = width) =>
      Array.from({ length: height }, () => Array<PixelColor>(width).fill("#12345680")));
    await createNewPack("Defaults", "All textures");
    await store.selectItem(path);
    if (source.width === source.height) {
      expect(parsePngToGrid).toHaveBeenLastCalledWith(`/vanilla_base/${path}`, source.width);
    } else {
      expect(parsePngToGrid).toHaveBeenLastCalledWith(`/vanilla_base/${path}`, source.width, source.height);
    }
    expect([store.width, store.height]).toEqual([source.width, source.height]);
    expect(store.layers[0].data[0][0]).toBe("#12345680");
    expect(store.getEditedItems()).toEqual([]);
    store.markItemEdited(path);
    const exported = store.getEditedItems()[0];
    expect(`${exported.categoryPath}/${exported.id}.png`).toBe(path);
    expect(exported.metadata).toBe(source.metadata);
    store.saveProjectLocal();
    expect(store.loadProjectLocal()).toBe(true);
    expect([store.width, store.height]).toEqual([source.width, source.height]);
    expect(store.getEditedItems()[0].metadata).toBe(source.metadata);
  });

  it("rejects invalid resizes without history, redo or data mutations and keeps no-op resizes inert", () => {
    const store = usePackStore();
    const before = JSON.stringify(store.layers);
    store.redoStack = [before];
    expect(() => store.resizeCanvasAdvanced(0, 32, "center", true)).toThrow(RangeError);
    expect(() => store.resizeCanvasAdvanced(32, 1.5, "center", false)).toThrow(RangeError);
    store.resizeCanvasAdvanced(16, 16, "center", true);
    expect(JSON.stringify(store.layers)).toBe(before);
    expect(store.historyStack).toEqual([]);
    expect(store.redoStack).toEqual([before]);
  });

  it("creates and immediately persists a clean pack with the full manifest while preserving custom palettes", async () => {
    const store = usePackStore();
    store.packName = "Old name";
    store.loadTextures(["block/stone.png"]);
    await store.selectItem("block/stone.png");
    store.addLayer();
    store.resizeCanvas(32);
    store.activeTool = "circle";
    store.onionSkinRange = 2;
    store.symmetryHorizontal = true;
    store.setActiveColor("#ff000080");
    store.saveCustomPalette("Keep palette", ["#123456"]);
    store.saveProjectLocal();
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    await createNewPack("  New pack  ", "Fresh description");
    expect(remove).toHaveBeenCalledWith("openpack_save");
    expect(store.packName).toBe("New pack");
    expect(store.packDescription).toBe("Fresh description");
    expect(store.packFormat).toBe(34);
    expect(store.categories.flatMap(({ items }) => items)).toHaveLength(DEFAULT_TEXTURE_PATHS.length);
    expect(store.categories.flatMap(({ items }) => items).every((item) => !item.edited && !item.savedLayers)).toBe(true);
    expect(store.layers).toHaveLength(1);
    expect(store.layers[0].data).toEqual(initGrid(16));
    expect([store.width, store.height, store.activeLayerIndex, store.onionSkinRange]).toEqual([16, 16, 0, 0]);
    expect(store.activeItemId).toBe("");
    expect(store.pendingItemId).toBe("");
    expect(store.historyStack).toEqual([]);
    expect(store.redoStack).toEqual([]);
    expect(store.activeTool).toBe("pencil");
    expect(store.symmetryHorizontal).toBe(false);
    expect(store.customPalettes[0].name).toBe("Keep palette");
    expect(JSON.parse(localStorage.getItem("openpack_save")!).packName).toBe("New pack");
    expect(parsePngToGrid).toHaveBeenCalledOnce();
  });

  it("invalidates old pending PNG loads, so they cannot overwrite the new pack", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png"]);
    let resolve!: (data: PixelColor[][]) => void;
    vi.mocked(parsePngToGrid).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = store.selectItem("block/stone.png");
    await createNewPack("Fresh", "Description");
    const grid = initGrid(16);
    grid[0][0] = "#123456";
    resolve(grid);
    await pending;
    expect(store.activeItemId).toBe("");
    expect(store.layers[0].data[0][0]).toBeNull();
    expect(store.packName).toBe("Fresh");
  });

  it("does not allow a queued autosave to restore the previous project", async () => {
    vi.useFakeTimers();
    const store = usePackStore();
    store.layers[0].data[0][0] = "#abcdef";
    await nextTick();
    await createNewPack("Fresh", "New");
    await nextTick();
    await vi.advanceTimersByTimeAsync(1000);
    const saved = JSON.parse(localStorage.getItem("openpack_save")!);
    expect(saved.packName).toBe("Fresh");
    expect(saved.canvasLayers[0].data[0][0]).toBeNull();
  });

  it("rejects blank names before clearing the existing save", async () => {
    const store = usePackStore();
    store.saveProjectLocal();
    const serialized = localStorage.getItem("openpack_save");
    await expect(createNewPack("   ", "")).rejects.toThrow("Enter a name");
    expect(localStorage.getItem("openpack_save")).toBe(serialized);
  });

  it("does not claim persistence succeeded if the fresh project cannot be saved", async () => {
    const store = usePackStore();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    await expect(createNewPack("Fresh", "")).rejects.toThrow("open, but was not saved");
    expect(store.packName).toBe("Fresh");
    expect(store.persistenceError).toContain("Quota exceeded");
  });

  it("persists rectangular sizes and pack format, while retaining compatibility with older saves", () => {
    const store = usePackStore();
    store.resizeCanvasAdvanced(20, 12, "top-left", false);
    store.packFormat = 42;
    store.saveProjectLocal();
    const saved = JSON.parse(localStorage.getItem("openpack_save")!);
    store.$dispose();
    setActivePinia(createPinia());
    const restored = usePackStore();
    expect([restored.width, restored.height, restored.packFormat]).toEqual([20, 12, 42]);
    delete saved.packFormat;
    localStorage.setItem("openpack_save", JSON.stringify(saved));
    expect(restored.loadProjectLocal()).toBe(true);
    expect(restored.packFormat).toBe(34);
    saved.packFormat = -1;
    localStorage.setItem("openpack_save", JSON.stringify(saved));
    expect(restored.loadProjectLocal()).toBe(false);
    expect(restored.persistenceError).toContain("invalid");
  });
});
