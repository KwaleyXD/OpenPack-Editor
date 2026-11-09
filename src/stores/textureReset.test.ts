import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePackStore } from "./packState";
import { parsePngToGrid } from "../engine/imageLoader";
import type { PixelColor } from "../engine/canvasEngine";

vi.mock("../engine/imageLoader", () => ({ parsePngToGrid: vi.fn() }));

describe("resetting a texture", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.mocked(parsePngToGrid).mockReset();
    vi.mocked(parsePngToGrid).mockImplementation(async (_url, width, height = width) =>
      Array.from({ length: height }, () => Array<PixelColor>(width).fill("#123456")));
  });
  afterEach(() => {
    usePackStore().$dispose();
    localStorage.clear();
  });

  it("restores original pixels, layers and dimensions and removes only that edit from export and autosave", async () => {
    const store = usePackStore();
    store.loadTextures(["item/clock_00.png", "item/clock_01.png"]);
    await store.selectItem("item/clock_01.png");
    store.layers[0].data[0][0] = "#abcdef";
    store.markItemEdited(store.activeItemId);
    await store.selectItem("item/clock_00.png");
    store.resizeCanvasAdvanced(32, 32, "top-left", true);
    store.addLayer();
    store.layers[1].data[0][0] = "#ffffff";
    expect(await store.resetActiveTexture("item/clock_00.png")).toBe(true);
    expect([store.width, store.height, store.layers.length]).toEqual([16, 16, 1]);
    expect(store.layers[0].data[0][0]).toBe("#123456");
    expect(store.historyStack).toEqual([]);
    expect(store.getEditedItems().map(({ id }) => id)).toEqual(["clock_01"]);
    expect(store.categoryProgress("misc-tools").completed).toBe(1);
    expect(store.saveProjectLocal()).toBe(true);
    expect(store.loadProjectLocal()).toBe(true);
    expect(store.getEditedItems().map(({ id }) => id)).toEqual(["clock_01"]);
    await store.selectItem("item/clock_01.png");
    expect(store.layers[0].data[0][0]).toBe("#abcdef");
    await store.selectItem("item/clock_00.png");
    expect(store.layers[0].data[0][0]).toBe("#123456");
  });

  it("resets the entire animated sprite sheet and returns to the first frame", async () => {
    const store = usePackStore();
    store.loadTextures(["block/lantern.png"]);
    await store.selectItem("block/lantern.png");
    store.layers[0].data[32][0] = "#ffffff";
    store.markItemEdited(store.activeItemId);
    store.selectFrame(2);
    expect(await store.resetActiveTexture(store.activeItemId)).toBe(true);
    expect(store.activeFrameIndex).toBe(0);
    expect([store.width, store.height]).toEqual([16, 48]);
    expect(store.layers[0].data[32][0]).toBe("#123456");
    expect(store.getEditedItems()).toEqual([]);
  });

  it("preserves edits when the default cannot load or is unavailable", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "item/missing.png"]);
    await store.selectItem("block/stone.png");
    store.layers[0].data[0][0] = "#abcdef";
    store.markItemEdited(store.activeItemId);
    vi.mocked(parsePngToGrid).mockRejectedValueOnce(new Error("Missing PNG"));
    await expect(store.resetActiveTexture(store.activeItemId)).rejects.toThrow("Missing PNG");
    expect(store.layers[0].data[0][0]).toBe("#abcdef");
    expect(store.getEditedItems()).toHaveLength(1);
    expect(store.pendingItemId).toBe("");
    await store.selectItem("item/missing.png");
    store.markItemEdited(store.activeItemId);
    await expect(store.resetActiveTexture(store.activeItemId)).rejects.toThrow("No Minecraft default");
    expect(store.getEditedItems()).toHaveLength(2);
  });

  it("does not discard edits made while the default is loading", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png"]);
    await store.selectItem("block/stone.png");
    store.markItemEdited(store.activeItemId);
    let resolve!: (data: PixelColor[][]) => void;
    vi.mocked(parsePngToGrid).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const reset = store.resetActiveTexture(store.activeItemId);
    store.layers[0].data[0][0] = "#abcdef";
    resolve(Array.from({ length: 16 }, () => Array<PixelColor>(16).fill("#123456")));
    await expect(reset).rejects.toThrow("changed while its default was loading");
    expect(store.layers[0].data[0][0]).toBe("#abcdef");
    expect(store.getEditedItems()).toHaveLength(1);
  });

  it("does not apply a stale reset after selecting another texture", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "block/dirt.png"]);
    await store.selectItem("block/stone.png");
    store.layers[0].data[0][0] = "#abcdef";
    store.markItemEdited(store.activeItemId);
    let resolve!: (data: PixelColor[][]) => void;
    vi.mocked(parsePngToGrid).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const reset = store.resetActiveTexture(store.activeItemId);
    await store.selectItem("block/dirt.png");
    resolve(Array.from({ length: 16 }, () => Array<PixelColor>(16).fill("#123456")));
    expect(await reset).toBe(false);
    expect(store.activeItemId).toBe("block/dirt.png");
    expect(store.getEditedItems()[0].layers[0].data[0][0]).toBe("#abcdef");
  });
});
