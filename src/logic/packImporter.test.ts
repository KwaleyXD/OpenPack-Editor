import JSZip from "jszip";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePackStore } from "../stores/packState";
import { getSourceTextureBlob, saveSourcePack } from "../stores/sourcePackStorage";
import { parsePngToGrid } from "../engine/imageLoader";
import { importResourcePack } from "./packImporter";

vi.mock("../stores/sourcePackStorage", () => ({
  saveSourcePack: vi.fn(),
  getSourceTextureBlob: vi.fn(async () => new Blob()),
}));
vi.mock("../engine/imageLoader", () => ({
  parsePngToGrid: vi.fn(async (_url: string, width: number, height = width) =>
    Array.from({ length: height }, () => Array(width).fill(null))),
}));

function pngHeader(width: number, height: number): Uint8Array {
  const data = new Uint8Array(24);
  data.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  data.set([73, 72, 68, 82], 12);
  new DataView(data.buffer).setUint32(16, width);
  new DataView(data.buffer).setUint32(20, height);
  return data;
}

async function createPackFile(includeTextures = true): Promise<File> {
  const zip = new JSZip();
  zip.file("pack.mcmeta", JSON.stringify({ pack: { pack_format: 42, description: "Imported description" } }));
  if (includeTextures) {
    zip.file("assets/minecraft/textures/block/stone.png", pngHeader(16, 16));
    zip.file("assets/minecraft/textures/block/animated.png", pngHeader(16, 32));
    zip.file("assets/minecraft/textures/block/animated.png.mcmeta", '{"animation":{"frametime":2}}');
    zip.file("assets/example.mod/textures/item/custom.png", pngHeader(32, 16));
    zip.file("assets/example.mod/textures/rooted.png", pngHeader(8, 8));
    zip.file("assets/example.mod/models/item/custom.json", '{"preserved":true}');
  }
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new File([bytes], "Imported.zip", { type: "application/zip" });
}

describe("resource pack import", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.mocked(saveSourcePack).mockReset().mockResolvedValue();
    vi.mocked(getSourceTextureBlob).mockReset().mockResolvedValue(new Blob());
    vi.mocked(parsePngToGrid).mockReset().mockImplementation(async (_url, width, height = width) =>
      Array.from({ length: height }, () => Array(width).fill(null)));
  });

  afterEach(() => {
    usePackStore().$dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("imports every namespaced texture, dimensions, and animation metadata into a replacement project", async () => {
    const file = await createPackFile();
    const store = usePackStore();
    store.packName = "Previous pack";

    await importResourcePack(file);

    const items = store.categories.flatMap(({ items: categoryItems }) => categoryItems);
    expect(items.map(({ filePath }) => filePath).sort()).toEqual([
      "assets/example.mod/textures/item/custom.png",
      "assets/example.mod/textures/rooted.png",
      "assets/minecraft/textures/block/animated.png",
      "assets/minecraft/textures/block/stone.png",
    ]);
    expect(items.find(({ name }) => name === "custom.png")).toMatchObject({
      sourceWidth: 32,
      sourceHeight: 16,
    });
    expect(items.find(({ name }) => name === "animated.png")?.metadata).toBe('{"animation":{"frametime":2}}');
    expect(store).toMatchObject({
      packName: "Imported",
      packDescription: "Imported description",
      packFormat: 42,
      importedPackId: expect.any(String),
      activeItemId: "",
    });
    expect(JSON.parse(localStorage.getItem("openpack_save")!).importedPackId).toBe(store.importedPackId);
    expect(saveSourcePack).toHaveBeenCalledWith(store.importedPackId, file);
    expect(store.loadProjectLocal()).toBe(true);
    expect(store.categories.flatMap(({ items: categoryItems }) => categoryItems)
      .find(({ name }) => name === "custom.png")).toMatchObject({
      sourceWidth: 32,
      sourceHeight: 16,
    });

    const url = vi.fn(() => "blob:imported-texture");
    const revoke = vi.fn();
    const NativeURL = URL;
    vi.stubGlobal("URL", class extends NativeURL {
      static createObjectURL = url;
      static revokeObjectURL = revoke;
    });
    await store.selectItem("assets/example.mod/textures/item/custom.png");
    expect(getSourceTextureBlob).toHaveBeenCalledWith(store.importedPackId, "assets/example.mod/textures/item/custom.png");
    expect(parsePngToGrid).toHaveBeenCalledWith("blob:imported-texture", 32, 16);
    expect([store.width, store.height]).toEqual([32, 16]);
    expect(revoke).toHaveBeenCalledWith("blob:imported-texture");
    store.layers[0].data[0][0] = "#ffffff";
    store.markItemEdited(store.activeItemId);
    await store.resetActiveTexture(store.activeItemId);
    expect(store.layers[0].data[0][0]).toBeNull();
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it("rejects archives without textures without replacing the open project", async () => {
    const store = usePackStore();
    store.packName = "Keep this";
    await expect(importResourcePack(await createPackFile(false))).rejects.toThrow("no textures");
    expect(store.packName).toBe("Keep this");
    expect(saveSourcePack).not.toHaveBeenCalled();
  });
});
