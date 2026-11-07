import { createPinia, setActivePinia } from "pinia";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CanvasWorkspace from "./CanvasWorkspace.vue";
import TexturePreview from "../panels/TexturePreview.vue";
import { usePackStore } from "../../stores/packState";
import { parsePngToGrid } from "../../engine/imageLoader";
import { type DrawingTool } from "../../logic/toolLogic";
import type { PixelColor } from "../../engine/canvasEngine";

vi.mock("../../engine/imageLoader", () => ({ parsePngToGrid: vi.fn() }));
enableAutoUnmount(afterEach);
const colors = ["#ff0000", "#00ff00", "#0000ff"];

describe("animation frame editing", () => {
  let context: CanvasRenderingContext2D;
  let draws: Array<{ color: string | CanvasGradient | CanvasPattern; alpha: number }>;
  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    draws = [];
    const mock: Partial<CanvasRenderingContext2D> = {
      clearRect: vi.fn(), fillRect: vi.fn(() => draws.push({ color: context.fillStyle, alpha: context.globalAlpha })),
      strokeRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    };
    context = mock as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      Object.defineProperty(context, "canvas", { value: this, configurable: true });
      return context;
    });
    vi.mocked(parsePngToGrid).mockImplementation(async (_url, width, height = width) =>
      Array.from({ length: height }, (_, y) => Array<PixelColor>(width).fill(colors[Math.floor(y / 16)])));
    const store = usePackStore();
    store.loadTextures(["block/lantern.png", "block/stone.png"]);
    await store.selectItem("block/lantern.png");
    store.selectFrame(1);
  });
  afterEach(() => {
    usePackStore().$dispose();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each(["pencil", "eraser", "bucket", "fill-all", "dither", "line", "rectangle", "circle"] satisfies DrawingTool[])(
    "edits only the selected frame with %s and preserves sheet history", async (tool) => {
      const store = usePackStore();
      store.activeTool = tool;
      store.setActiveColor("#abcdef");
      const wrapper = mount(CanvasWorkspace);
      expect(wrapper.get("canvas").attributes("aria-label")).toBe("16 by 16 pixel texture editor");
      expect(wrapper.get("canvas").attributes("height")).toBe("512");
      const before = JSON.stringify(store.layers);
      await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      await wrapper.get("canvas").trigger("mousemove", { buttons: 1, clientX: 65, clientY: 65 });
      await wrapper.get("canvas").trigger("mouseup", { clientX: 65, clientY: 65 });
      expect(store.layers[0].data.slice(0, 16).flat().every((color) => color === colors[0])).toBe(true);
      expect(store.layers[0].data.slice(32).flat().every((color) => color === colors[2])).toBe(true);
      expect(store.layers[0].data.slice(16, 32).flat().some((color) => color !== colors[1])).toBe(true);
      expect(store.historyStack).toHaveLength(1);
      store.undo();
      expect(JSON.stringify(store.layers)).toBe(before);
      expect(store.activeFrameIndex).toBe(1);
      store.redo();
      expect(JSON.stringify(store.layers)).not.toBe(before);
    },
  );

  it.each([0, 1, 2, 3])("shows the requested neighboring frames at onion mode %s", async (mode) => {
    const store = usePackStore();
    store.onionSkinRange = mode;
    const wrapper = mount(CanvasWorkspace);
    await nextTick();
    expect(draws.some(({ color, alpha }) => color === colors[1] && alpha === 1)).toBe(true);
    const ghostColors = [...new Set(draws.filter(({ alpha }) => alpha === 0.3).map(({ color }) => color))];
    expect(ghostColors).toEqual(mode === 0 ? [] : mode === 1 ? [colors[0]] : mode === 2 ? [colors[0], colors[2]] : [colors[2]]);
    const before = JSON.stringify(store.layers);
    draws.length = 0;
    mount(TexturePreview);
    expect(draws.every(({ alpha, color }) => alpha === 1 && color === colors[1])).toBe(true);
    expect(JSON.stringify(store.layers)).toBe(before);
    expect(store.historyStack).toEqual([]);
    wrapper.unmount();
  });

  it("renders numbered neighboring files and uses their saved edits as onion skins", async () => {
    const store = usePackStore();
    vi.mocked(parsePngToGrid).mockImplementation(async (url, width, height = width) => {
      const color = url.includes("clock_00") ? colors[0] : url.includes("clock_01") ? colors[1] : colors[2];
      return Array.from({ length: height }, () => Array<PixelColor>(width).fill(color));
    });
    store.loadTextures(["item/clock_00.png", "item/clock_01.png", "item/clock_02.png"]);
    await store.selectItem("item/clock_00.png");
    store.layers[0].data[0][0] = "#abcdef";
    store.markItemEdited(store.activeItemId);
    await store.selectItem("item/clock_01.png");
    store.onionSkinRange = 2;
    draws.length = 0;
    const wrapper = mount(CanvasWorkspace);
    await flushPromises();
    expect(draws.some(({ color, alpha }) => color === "#abcdef" && alpha === 0.3)).toBe(true);
    expect(draws.some(({ color, alpha }) => color === colors[2] && alpha === 0.3)).toBe(true);
    expect(draws.some(({ color, alpha }) => color === colors[1] && alpha === 1)).toBe(true);
    expect(store.getEditedItems()).toHaveLength(1);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("reports failed numbered onion frame loading without changing the active texture", async () => {
    const store = usePackStore();
    store.loadTextures(["item/clock_00.png", "item/clock_01.png"]);
    await store.selectItem("item/clock_00.png");
    vi.mocked(parsePngToGrid).mockRejectedValueOnce(new Error("Missing frame"));
    store.onionSkinRange = 3;
    const wrapper = mount(CanvasWorkspace);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Missing frame");
    expect(store.activeItemId).toBe("item/clock_00.png");
  });

  it("reports mismatched numbered frame dimensions", async () => {
    const store = usePackStore();
    store.loadTextures(["item/clock_00.png", "item/clock_01.png"]);
    await store.selectItem("item/clock_00.png");
    store.resizeCanvasAdvanced(32, 32, "top-left", true);
    store.onionSkinRange = 3;
    const wrapper = mount(CanvasWorkspace);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("same dimensions");
  });

  it("discards a stale numbered onion load after switching it off", async () => {
    const store = usePackStore();
    store.loadTextures(["item/clock_00.png", "item/clock_01.png"]);
    await store.selectItem("item/clock_00.png");
    let resolve!: (pixels: PixelColor[][]) => void;
    vi.mocked(parsePngToGrid).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    store.onionSkinRange = 3;
    mount(CanvasWorkspace);
    store.onionSkinRange = 0;
    await nextTick();
    draws.length = 0;
    resolve(Array.from({ length: 16 }, () => Array<PixelColor>(16).fill("#123456")));
    await flushPromises();
    expect(draws.some(({ color, alpha }) => color === "#123456" && alpha === 0.3)).toBe(false);
  });

  it("cancels a shape when switching frames without drawing into the next frame", async () => {
    const store = usePackStore();
    store.activeTool = "rectangle";
    const wrapper = mount(CanvasWorkspace);
    const before = JSON.stringify(store.layers);
    await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    store.selectFrame(2);
    await wrapper.get("canvas").trigger("mouseup", { clientX: 65, clientY: 65 });
    expect(JSON.stringify(store.layers)).toBe(before);
    expect(store.historyStack).toEqual([]);
  });

  it("keeps all sheet frames, dimensions and metadata through export, asset switches and autosave", async () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace);
    await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    await wrapper.get("canvas").trigger("mouseup");
    const sheet = store.getEditedItems()[0];
    expect(sheet).toMatchObject({ id: "lantern", categoryPath: "block", width: 16, height: 48 });
    expect(sheet.layers[0].data[16][0]).toBe("#ffffff");
    expect(sheet.layers[0].data[0][0]).toBe(colors[0]);
    expect(JSON.parse(sheet.metadata!).animation.frametime).toBe(8);
    store.saveProjectLocal();
    expect(store.loadProjectLocal()).toBe(true);
    expect(store.activeFrameIndex).toBe(1);
    expect(store.frameLayers[0].data[0][0]).toBe("#ffffff");
    await store.selectItem("block/stone.png");
    await store.selectItem("block/lantern.png");
    store.selectFrame(1);
    expect(store.frameLayers[0].data[0][0]).toBe("#ffffff");
    expect(store.getEditedItems()[0].height).toBe(48);
  });

  it("resizes every physical frame and updates export dimensions without losing timing", async () => {
    const store = usePackStore();
    store.resizeCanvasAdvanced(32, 24, "top-left", true);
    expect([store.frameWidth, store.frameHeight, store.width, store.height]).toEqual([32, 24, 32, 72]);
    expect(store.layers[0].data[0][0]).toBe(colors[0]);
    expect(store.layers[0].data[24][0]).toBe(colors[1]);
    expect(store.layers[0].data[48][0]).toBe(colors[2]);
    store.markItemEdited("block/lantern.png");
    expect(JSON.parse(store.getEditedItems()[0].metadata!).animation).toEqual({ width: 32, height: 24, frametime: 8 });
    store.undo();
    expect([store.width, store.height]).toEqual([16, 48]);
    store.redo();
    expect([store.frameWidth, store.frameHeight]).toEqual([32, 24]);
  });
});
