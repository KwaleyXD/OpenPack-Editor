import { Blob as NodeBlob } from "node:buffer";
import JSZip from "jszip";
import { createPinia, getActivePinia } from "pinia";
import { usePackStore } from "../stores/packState";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initGrid, type Layer } from "./canvasEngine";
import {
  buildPackZip,
  exportCanvasToBlob,
  generateMcMeta,
  type EditedTexture,
} from "./exportEngine";

vi.mock("./imageLoader", () => ({
  parsePngToGrid: vi.fn(async (_url: string, size: number) => initGrid(size)),
}));

const pngBytes = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=="),
  (character) => character.charCodeAt(0),
);

function createLayer(data = initGrid(2)): Layer {
  return { id: "base", name: "Base", visible: true, data };
}

function createItem(overrides: Partial<EditedTexture> = {}): EditedTexture {
  return {
    id: "stone",
    categoryPath: "block",
    width: 2,
    height: 2,
    layers: [createLayer()],
    ...overrides,
  };
}

describe("generateMcMeta", () => {
  it("generates standard metadata with the requested default format", () => {
    expect(JSON.parse(generateMcMeta('Pack "name"\nTest'))).toEqual({
      pack: { pack_format: 34, description: 'Pack "name"\nTest' },
    });
  });

  it("accepts a caller-supplied format", () => {
    expect(JSON.parse(generateMcMeta("Pack", 42)).pack.pack_format).toBe(42);
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid format %s", (format) => {
    expect(() => generateMcMeta("Pack", format)).toThrow(RangeError);
  });

  it("rejects an empty pack name", () => {
    expect(() => generateMcMeta("  ")).toThrow("Pack name must not be empty");
  });
});

describe("PNG and ZIP export", () => {
  let draws: Array<{ color: string | CanvasGradient | CanvasPattern; rect: number[] }>;
  let context: CanvasRenderingContext2D;
  let canvases: HTMLCanvasElement[];
  let anchors: HTMLAnchorElement[];
  const createObjectURL = vi.fn(() => "blob:export-test");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    vi.stubGlobal("Blob", NodeBlob);
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    draws = [];
    canvases = [];
    anchors = [];
    const mockContext: Partial<CanvasRenderingContext2D> = {
      fillStyle: "",
      globalAlpha: 0.2,
      globalCompositeOperation: "copy",
      imageSmoothingEnabled: true,
      fillRect: vi.fn((...rect: number[]) => {
        draws.push({ color: context.fillStyle, rect });
      }),
    };
    context = mockContext as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback) {
      canvases.push(this);
      callback(new Blob([pngBytes], { type: "image/png" }));
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      anchors.push(this);
    });
  });

  afterEach(() => {
    const pinia = getActivePinia();
    if (pinia) {
      usePackStore(pinia).$dispose();
    }
    localStorage.clear();
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders native-resolution pixels in layer order with alpha, without a grid", async () => {
    const layers: Layer[] = [
      createLayer([["#123456", null], [null, "#abcdef"]]),
      { ...createLayer([["#ffffff", "#ffffff"], ["#ffffff", "#ffffff"]]), visible: false },
      createLayer([["#ff000080", null], [null, null]]),
    ];
    const before = JSON.stringify(layers);
    const blob = await exportCanvasToBlob(layers, 2, 2);

    expect(blob.type).toBe("image/png");
    expect(draws).toEqual([
      { color: "#123456", rect: [0, 0, 1, 1] },
      { color: "#abcdef", rect: [1, 1, 1, 1] },
      { color: "#ff000080", rect: [0, 0, 1, 1] },
    ]);
    expect(context.globalAlpha).toBe(1);
    expect(context.globalCompositeOperation).toBe("source-over");
    expect(context.imageSmoothingEnabled).toBe(false);
    const canvas = canvases[0];
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(2);
    expect(canvas.isConnected).toBe(false);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function), "image/png",
    );
    expect(JSON.stringify(layers)).toBe(before);
  });

  it("exports a blank transparent texture at exactly 16 by 16", async () => {
    await exportCanvasToBlob([createLayer(initGrid(16))], 16, 16);
    expect(draws).toEqual([]);
    const canvas = canvases[0];
    expect([canvas.width, canvas.height]).toEqual([16, 16]);
  });

  it.each([[0, 16], [16, -1], [1.5, 16], [16, NaN]])(
    "rejects invalid dimensions (%s, %s)",
    async (width, height) => {
      await expect(exportCanvasToBlob([], width, height)).rejects.toThrow(RangeError);
    },
  );

  it("reports missing contexts and failed PNG encoding", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    await expect(exportCanvasToBlob([], 2, 2)).rejects.toThrow("2D context");
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => callback(null));
    await expect(exportCanvasToBlob([], 2, 2)).rejects.toThrow("encode");
  });

  it("propagates synchronous encoding failures", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(() => {
      throw new Error("Encoding failed");
    });
    await expect(exportCanvasToBlob([], 2, 2)).rejects.toThrow("Encoding failed");
  });

  it("rejects mismatched layer dimensions and malformed hex colors", async () => {
    await expect(exportCanvasToBlob([createLayer()], 16, 16)).rejects.toThrow("dimensions");
    await expect(exportCanvasToBlob([createLayer([["invalid"]])], 1, 1)).rejects.toThrow("Invalid hex");
  });

  it("builds a readable ZIP with root metadata and exact item/block PNG paths", async () => {
    const download = vi.mocked(HTMLAnchorElement.prototype.click);
    const blob = await buildPackZip("My Pack", [
      createItem(),
      createItem({ id: "diamond_sword", categoryPath: "item/" }),
    ], 42);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(JSON.parse(await zip.file("pack.mcmeta")!.async("string"))).toEqual({
      pack: { pack_format: 42, description: "My Pack" },
    });
    expect(Object.values(zip.files).filter((entry) => !entry.dir).map((entry) => entry.name)).toEqual([
      "pack.mcmeta",
      "assets/minecraft/textures/block/stone.png",
      "assets/minecraft/textures/item/diamond_sword.png",
    ]);
    for (const path of [
      "assets/minecraft/textures/block/stone.png",
      "assets/minecraft/textures/item/diamond_sword.png",
    ]) {
      expect(await zip.file(path)!.async("uint8array")).toEqual(pngBytes);
    }
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(download).toHaveBeenCalledOnce();
    expect(anchors[0].download).toBe("My Pack.zip");
    expect(anchors[0].href).toBe("blob:export-test");
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:export-test");
  });

  it("allows metadata-only packs and sanitizes download filenames", async () => {
    await buildPackZip("My/Pack:Test", []);
    expect(anchors[0].download).toBe("My_Pack_Test.zip");
  });

  it("exports nested entity, GUI, and animated texture paths with exact metadata sidecars", async () => {
    const metadata = '{"animation":{"frametime":2,"interpolate":true}}';
    const blob = await buildPackZip("Pack", [
      createItem({ categoryPath: "entity/creeper", id: "creeper" }),
      createItem({ categoryPath: "gui/sprites/container", id: "slot" }),
      createItem({ categoryPath: "block", id: "lava_still", metadata }),
    ]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file("assets/minecraft/textures/entity/creeper/creeper.png")).not.toBeNull();
    expect(zip.file("assets/minecraft/textures/gui/sprites/container/slot.png")).not.toBeNull();
    expect(await zip.file("assets/minecraft/textures/block/lava_still.png.mcmeta")!.async("string")).toBe(metadata);
  });

  it.each(["../entity", "entity/../../evil", "/entity", "entity//creeper", "entity/."])(
    "rejects unsafe export folder %s before starting a download",
    async (categoryPath) => {
      await expect(buildPackZip("Pack", [createItem({ categoryPath })])).rejects.toThrow("Cannot determine");
      expect(createObjectURL).not.toHaveBeenCalled();
    },
  );

  it("exports distinct cached and live textures at their own sizes", async () => {
    const store = usePackStore(createPinia());
    store.loadTextures(["assets/minecraft/textures/block/stone.png", "assets/minecraft/textures/item/diamond_sword.png"]);
    await store.selectItem("assets/minecraft/textures/block/stone.png");
    store.layers[0].data[0][0] = "#123456";
    store.resizeCanvas(32);
    await store.selectItem("assets/minecraft/textures/item/diamond_sword.png");
    store.layers[0].data[1][1] = "#abcdef";
    store.markItemEdited(store.activeItemId);
    const blob = await buildPackZip(store.packName, store.getEditedItems(), 34, store.packDescription);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file("assets/minecraft/textures/block/stone.png")).not.toBeNull();
    expect(zip.file("assets/minecraft/textures/item/diamond_sword.png")).not.toBeNull();
    expect(canvases.map((canvas) => canvas.width)).toEqual([32, 16]);
    expect(draws).toEqual([
      { color: "#123456", rect: [0, 0, 1, 1] },
      { color: "#123456", rect: [1, 0, 1, 1] },
      { color: "#123456", rect: [0, 1, 1, 1] },
      { color: "#123456", rect: [1, 1, 1, 1] },
      { color: "#abcdef", rect: [1, 1, 1, 1] },
    ]);
    expect(JSON.parse(await zip.file("pack.mcmeta")!.async("string")).pack.description)
      .toBe("Made in OpenPack Editor");
  });

  it.each(["../stone", "stone.png", "assets/minecraft/stone", "Stone"])(
    "rejects invalid texture ID %s rather than exporting to an incorrect path",
    async (id) => {
      await expect(buildPackZip("Pack", [createItem({ id })])).rejects.toThrow("filename stem");
      expect(createObjectURL).not.toHaveBeenCalled();
    },
  );

  it("rejects duplicate archive entries rather than silently overwriting textures", async () => {
    await expect(buildPackZip("Pack", [
      createItem(), createItem({ categoryPath: "block/" }),
    ])).rejects.toThrow("Duplicate texture");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("does not download when texture encoding fails", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => callback(null));
    await expect(buildPackZip("Pack", [createItem()])).rejects.toThrow("encode");
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("cleans up the anchor and URL even when the download click throws", async () => {
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(() => {
      throw new Error("Download failed");
    });
    await expect(buildPackZip("Pack", [])).rejects.toThrow("Download failed");
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export-test");
  });
});
