import { createPinia, setActivePinia } from "pinia";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CanvasWorkspace from "./CanvasWorkspace.vue";
import { usePackStore } from "../../stores/packState";
import { initGrid } from "../../engine/canvasEngine";

vi.mock("../../engine/imageLoader", () => ({
  parsePngToGrid: vi.fn(async (_url: string, size: number) => initGrid(size)),
}));

enableAutoUnmount(afterEach);

function createCanvasContext() {
  return {
    canvas: { width: 512, height: 512 },
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe("CanvasWorkspace", () => {
  let pinia: ReturnType<typeof createPinia>;
  let context: CanvasRenderingContext2D;

  beforeEach(() => {
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    context = createCanvasContext();

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      Object.defineProperty(context, "canvas", { value: this, configurable: true });
      return context;
    });
  });

  afterEach(() => {
    usePackStore(pinia).$dispose();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("mounts a 512px canvas and renders its initial 16 by 16 grid", () => {
    const wrapper = mount(CanvasWorkspace, {
      global: { plugins: [pinia] },
    });
    const canvas = wrapper.get("canvas");

    expect(canvas.attributes("width")).toBe("512");
    expect(canvas.attributes("height")).toBe("512");
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 512, 512);
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.strokeRect).toHaveBeenCalledTimes(16 * 16);
  });

    it.each(["line", "rectangle", "circle"] as const)(
      "previews %s without mutating layers, then commits one undoable change",
      async (tool) => {
        const store = usePackStore();
        const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
        store.activeTool = tool;
        const canvas = wrapper.get("canvas");
        await canvas.trigger("mousedown", { button: 0, clientX: 33, clientY: 33 });
        await canvas.trigger("mousemove", { buttons: 1, clientX: 129, clientY: 129 });
        expect(store.layers[0].data.flat().every((color) => color === null)).toBe(true);
        expect(store.historyStack).toEqual([]);
        expect(context.fillRect).toHaveBeenCalled();
        await canvas.trigger("mousemove", { buttons: 1, clientX: 97, clientY: 97 });
        await canvas.trigger("mouseup", { clientX: 97, clientY: 97 });
        expect(store.historyStack).toHaveLength(1);
        const result = JSON.stringify(store.layers);
        expect(store.layers[0].data[4][4]).toBeNull();
        expect(store.layers[0].data.flat().some((color) => color !== null)).toBe(true);
        store.undo();
        expect(store.layers[0].data.flat().every((color) => color === null)).toBe(true);
        store.redo();
        expect(JSON.stringify(store.layers)).toBe(result);
      },
    );

    it("uses the mouseup endpoint even without an intervening mousemove", async () => {
      const store = usePackStore();
      store.activeTool = "line";
      const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
      const canvas = wrapper.get("canvas");
      await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      await canvas.trigger("mouseup", { clientX: 97, clientY: 1 });
      expect(store.layers[0].data[0].slice(0, 4)).toEqual(Array(4).fill("#ffffff"));
    });

    it("cancels a shape on Escape or tool changes without history or pixel changes", async () => {
      const store = usePackStore();
      store.activeTool = "rectangle";
      const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
      const canvas = wrapper.get("canvas");
      await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      await canvas.trigger("mousemove", { buttons: 1, clientX: 97, clientY: 97 });
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await canvas.trigger("mouseup", { clientX: 97, clientY: 97 });
      expect(store.historyStack).toEqual([]);
      expect(store.layers[0].data.flat().every((color) => color === null)).toBe(true);
      await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      store.activeTool = "pencil";
      await canvas.trigger("mouseup", { clientX: 97, clientY: 97 });
      expect(store.historyStack).toEqual([]);
    });

    it("does not commit shape previews into another layer or hidden layers", async () => {
      const store = usePackStore();
      store.addLayer();
      store.historyStack = [];
      store.activeTool = "line";
      const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
      const canvas = wrapper.get("canvas");
      await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      store.activeLayerIndex = 0;
      await canvas.trigger("mouseup", { clientX: 97, clientY: 97 });
      expect(store.layers.every((layer) => layer.data.flat().every((color) => color === null))).toBe(true);
      expect(store.historyStack).toEqual([]);
      await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      store.layers[0].visible = false;
      await canvas.trigger("mouseup", { clientX: 97, clientY: 97 });
      expect(store.historyStack).toEqual([]);
      await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      await canvas.trigger("mouseup", { clientX: 97, clientY: 97 });
      expect(store.historyStack).toEqual([]);
    });

    it("preserves redo on no-op shape strokes", async () => {
      const store = usePackStore();
      store.activeTool = "line";
      store.layers[0].data[0][0] = "#ffffff";
      store.redoStack = [JSON.stringify(store.layers)];
      const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
      const canvas = wrapper.get("canvas");
      await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      await canvas.trigger("mouseup", { clientX: 1, clientY: 1 });
      expect(store.historyStack).toEqual([]);
      expect(store.redoStack).toHaveLength(1);
    });

    it("cancels a preview safely when its active layer is deleted", async () => {
      const store = usePackStore();
      store.addLayer();
      store.historyStack = [];
      store.activeTool = "line";
      const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
      await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      expect(() => store.deleteLayer(1)).not.toThrow();
      await wrapper.get("canvas").trigger("mouseup", { clientX: 97, clientY: 97 });
      expect(store.layers).toHaveLength(1);
      expect(store.layers[0].data.flat().every((color) => color === null)).toBe(true);
      expect(store.historyStack).toHaveLength(1);
    });

    it("uses filled geometry and mirrored marks for one undo step", async () => {
      const store = usePackStore();
      store.activeTool = "rectangle";
      store.shapeFilled = true;
      store.symmetryHorizontal = true;
      store.symmetryVertical = true;
      const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
      const canvas = wrapper.get("canvas");
      await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      await canvas.trigger("mouseup", { clientX: 65, clientY: 65 });
      expect(store.layers[0].data[1][1]).toBe("#ffffff");
      expect(store.layers[0].data[14][14]).toBe("#ffffff");
      expect(store.historyStack).toHaveLength(1);
    });

    it("dithers and mirrors freehand strokes, including a changed mirror of an unchanged source", async () => {
      const store = usePackStore();
      store.activeTool = "dither";
      store.symmetryHorizontal = true;
      store.layers[0].data[0][0] = "#ffffff";
      const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
      const canvas = wrapper.get("canvas");
      await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      await canvas.trigger("mousemove", { buttons: 1, clientX: 33, clientY: 1 });
      await canvas.trigger("mousemove", { buttons: 1, clientX: 65, clientY: 1 });
      await canvas.trigger("mouseup");
      expect(store.layers[0].data[0][15]).toBe("#ffffff");
      expect(store.layers[0].data[0][1]).toBeNull();
      expect(store.layers[0].data[0][2]).toBe("#ffffff");
      expect(store.layers[0].data[0][13]).toBe("#ffffff");
      expect(store.historyStack).toHaveLength(1);
    });

    it("records eyedropper colors in the recent-color history without canvas history", async () => {
      const store = usePackStore();
      store.activeTool = "eyedropper";
      store.layers[0].data[0][0] = "#12345680";
      const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
      await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
      expect(store.activeColor).toBe("#12345680");
      expect(store.recentColors[0]).toBe("#12345680");
      expect(store.historyStack).toEqual([]);
    });

  it("updates canvas dimensions and paints the last pixel after resize", async () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    store.resizeCanvas(32);
    await wrapper.vm.$nextTick();
    expect(wrapper.get("canvas").attributes("width")).toBe("1024");
    expect(wrapper.get("canvas").attributes("height")).toBe("1024");
    expect(wrapper.get("canvas").attributes("aria-label")).toBe("32 by 32 pixel texture editor");
    await wrapper.get("canvas").trigger("mousedown", {
      button: 0, clientX: 31 * 32 + 1, clientY: 31 * 32 + 1,
    });
    expect(store.layers[0].data[31][31]).toBe("#ffffff");
    expect(context.fillRect).toHaveBeenCalledWith(31 * 32, 31 * 32, 32, 32);
  });

  it("does not continue a stroke into a different texture", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png", "block/dirt.png"]);
    await store.selectItem("block/stone.png");
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    await store.selectItem("block/dirt.png");
    await canvas.trigger("mousemove", { buttons: 1, clientX: 33, clientY: 1 });
    expect(store.layers[0].data[0][1]).toBeNull();
    expect(store.historyStack).toEqual([]);
  });

  it("paints the clicked pixel using the active store color", async () => {
    const store = usePackStore();
    store.activeColor = "#12ab34";

    const wrapper = mount(CanvasWorkspace, {
      global: { plugins: [pinia] },
    });
    const canvas = wrapper.get("canvas").element;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
      right: 612,
      bottom: 562,
      width: 512,
      height: 512,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });

    await wrapper.get("canvas").trigger("mousedown", {
      button: 0,
      clientX: 100 + 3 * 32 + 4,
      clientY: 50 + 2 * 32 + 10,
    });

    expect(context.fillStyle).toBe("#12ab34");
    expect(context.fillRect).toHaveBeenCalledWith(3 * 32, 2 * 32, 32, 32);
  });

  it("continues painting while dragging and stops after mouseup", async () => {
    const wrapper = mount(CanvasWorkspace, {
      global: { plugins: [pinia] },
    });
    const canvas = wrapper.get("canvas");

    await canvas.trigger("mousedown", {
      button: 0,
      clientX: 1,
      clientY: 1,
    });
    await canvas.trigger("mousemove", {
      buttons: 1,
      clientX: 32 + 1,
      clientY: 1,
    });

    expect(context.fillRect).toHaveBeenCalledTimes(3);

    await canvas.trigger("mouseup");
    await canvas.trigger("mousemove", {
      clientX: 64 + 1,
      clientY: 1,
    });

    expect(context.fillRect).toHaveBeenCalledTimes(3);
  });

  it("ignores right-click erasing on transparent pixels and coordinates outside the canvas grid", async () => {
    const wrapper = mount(CanvasWorkspace, {
      global: { plugins: [pinia] },
    });
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 2, clientX: 1, clientY: 1 });
    await canvas.trigger("mousedown", { button: 0, clientX: -1, clientY: 1 });
    await canvas.trigger("mouseup");
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(usePackStore().historyStack).toEqual([]);
  });

    it.each(["pencil", "bucket", "eyedropper", "line", "rectangle", "circle", "dither"] as const)(
      "right-drags to erase while keeping %s selected, with one undo step",
      async (tool) => {
        const store = usePackStore();
        store.activeTool = tool;
        store.layers[0].data[0][0] = "#12345680";
        store.layers[0].data[0][1] = "#abcdef";
        const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
        const canvas = wrapper.get("canvas");
        await canvas.trigger("mousedown", { button: 2, clientX: 1, clientY: 1 });
        await canvas.trigger("mousemove", { buttons: 2, clientX: 33, clientY: 1 });
        await canvas.trigger("mouseup", { button: 2, clientX: 33, clientY: 1 });
        expect(store.layers[0].data[0].slice(0, 2)).toEqual([null, null]);
        expect(store.activeTool).toBe(tool);
        expect(store.historyStack).toHaveLength(1);
        store.undo();
        expect(store.layers[0].data[0].slice(0, 2)).toEqual(["#12345680", "#abcdef"]);
        store.redo();
        expect(store.layers[0].data[0].slice(0, 2)).toEqual([null, null]);
      },
    );

    it("blocks the context menu and respects symmetry, hidden layers, and right-button release", async () => {
      const store = usePackStore();
      store.symmetryHorizontal = true;
      store.layers[0].data[0][0] = "#ffffff";
      store.layers[0].data[0][15] = "#ffffff";
      store.layers[0].data[0][1] = "#abcdef";
      const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
      const canvas = wrapper.get("canvas");
      const contextMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      canvas.element.dispatchEvent(contextMenu);
      expect(contextMenu.defaultPrevented).toBe(true);
      await canvas.trigger("mousedown", { button: 2, clientX: 1, clientY: 1 });
      expect(store.layers[0].data[0][15]).toBeNull();
      await canvas.trigger("mousemove", { buttons: 0, clientX: 33, clientY: 1 });
      expect(store.layers[0].data[0][1]).toBe("#abcdef");
      store.layers[0].visible = false;
      await canvas.trigger("mousedown", { button: 2, clientX: 33, clientY: 1 });
      expect(store.layers[0].data[0][1]).toBe("#abcdef");
      expect(store.historyStack).toHaveLength(1);
    });
  it("marks the selected texture edited when painting", async () => {
    const store = usePackStore();
    const itemId = "assets/item/diamond_sword.png";
    store.loadTextures([itemId]);
    await store.selectItem(itemId);

    const wrapper = mount(CanvasWorkspace, {
      global: { plugins: [pinia] },
    });
    await wrapper.get("canvas").trigger("mousedown", {
      button: 0,
      clientX: 1,
      clientY: 1,
    });

    expect(store.categories[0]?.items[0]?.edited).toBe(true);
  });

  it("redraws on active-layer and onion-range changes even without pixel mutations", async () => {
    const store = usePackStore();
    store.layers[0].data[0][0] = "#123456";
    store.addLayer();
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    expect(context.fillRect).not.toHaveBeenCalled();
    store.onionSkinRange = 1;
    await wrapper.vm.$nextTick();
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 32, 32);
    const renders = vi.mocked(context.clearRect).mock.calls.length;
    store.activeLayerIndex = 0;
    await wrapper.vm.$nextTick();
    expect(context.clearRect).toHaveBeenCalledTimes(renders + 1);
    store.onionSkinRange = 0;
    await wrapper.vm.$nextTick();
    expect(context.clearRect).toHaveBeenCalledTimes(renders + 2);
    expect(context.globalAlpha).toBe(1);
  });

  it("uses the selected tool on the shared active layer", async () => {
    const store = usePackStore();
    store.addLayer();
    store.activeColor = "#123456";
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    expect(store.layers[1].data[0][0]).toBe("#123456");
    expect(store.layers[0].data[0][0]).toBeNull();
    store.activeTool = "eraser";
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    expect(store.layers[1].data[0][0]).toBeNull();
    store.activeTool = "bucket";
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    expect(store.layers[1].data.flat().every((color) => color === "#123456")).toBe(true);
    store.activeColor = "#ffffff";
    store.activeTool = "eyedropper";
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    expect(store.activeColor).toBe("#123456");
  });

  it("redraws visibility changes and does not paint a hidden layer", async () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    store.layers[0].visible = false;
    await wrapper.vm.$nextTick();
    expect(context.clearRect).toHaveBeenCalledTimes(2);
    await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    expect(store.layers[0].data[0][0]).toBeNull();
  });

  it("does not mark textures edited when picking color or painting the same color", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png"]);
    await store.selectItem("block/stone.png");
    store.layers[0].data[0][0] = store.activeColor;
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    store.activeTool = "eyedropper";
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    await canvas.trigger("mousedown", { button: 0, clientX: 33, clientY: 1 });
    expect(store.activeColor).toBe("#ffffff");
    expect(store.categories[0].items[0].edited).toBe(false);
  });

  it("undoes and redoes an entire pencil stroke as one step", async () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    await canvas.trigger("mousemove", { buttons: 1, clientX: 33, clientY: 1 });
    await canvas.trigger("mousemove", { buttons: 1, clientX: 65, clientY: 1 });
    await canvas.trigger("mouseup");
    expect(store.historyStack).toHaveLength(1);
    const renders = vi.mocked(context.clearRect).mock.calls.length;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    await wrapper.vm.$nextTick();
    expect(store.layers[0].data[0].slice(0, 3)).toEqual([null, null, null]);
    expect(vi.mocked(context.clearRect).mock.calls.length).toBeGreaterThan(renders);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true }));
    await wrapper.vm.$nextTick();
    expect(store.layers[0].data[0].slice(0, 3)).toEqual(Array(3).fill("#ffffff"));
  });

  it("fills all matching regions on only the active layer and supports undo/redo as one action", async () => {
    const store = usePackStore();
    store.layers[0].data[0][0] = "#12345680";
    store.addLayer();
    store.layers[1].data[0][0] = "#12345680";
    store.layers[1].data[0][2] = "#12345680";
    store.layers[1].data[4][4] = "#12345680";
    store.layers[1].data[0][15] = "#000000";
    store.symmetryHorizontal = true;
    store.activeColor = "#abcdef40";
    store.activeTool = "fill-all";
    store.historyStack = [];
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    expect(store.layers[1].data[0][0]).toBe("#abcdef40");
    expect(store.layers[1].data[0][2]).toBe("#abcdef40");
    expect(store.layers[1].data[4][4]).toBe("#abcdef40");
    expect(store.layers[1].data[0][15]).toBe("#000000");
    expect(store.layers[1].data[0][1]).toBeNull();
    expect(store.layers[0].data[0][0]).toBe("#12345680");
    await canvas.trigger("mousemove", { buttons: 1, clientX: 33, clientY: 1 });
    await canvas.trigger("mouseup", { clientX: 33, clientY: 1 });
    expect(store.layers[1].data[0][1]).toBeNull();
    expect(store.historyStack).toHaveLength(1);
    store.undo();
    expect(store.layers[1].data[4][4]).toBe("#12345680");
    store.redo();
    expect(store.layers[1].data[4][4]).toBe("#abcdef40");
  });

  it("keeps no-op Fill All clicks out of history and ignores hidden layers", async () => {
    const store = usePackStore();
    store.activeTool = "fill-all";
    store.layers[0].data[0][0] = store.activeColor;
    store.redoStack = [JSON.stringify(store.layers)];
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    expect(store.historyStack).toEqual([]);
    expect(store.redoStack).toHaveLength(1);
    store.layers[0].visible = false;
    await canvas.trigger("mousedown", { button: 0, clientX: 33, clientY: 1 });
    expect(store.layers[0].data[0][1]).toBeNull();
    expect(store.historyStack).toEqual([]);
  });

  it("captures one fill per click, not per mouse movement", async () => {
    const store = usePackStore();
    store.activeTool = "bucket";
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    store.activeColor = "#123456";
    await canvas.trigger("mousemove", { buttons: 1, clientX: 33, clientY: 1 });
    expect(store.layers[0].data[0][1]).toBe("#ffffff");
    expect(store.historyStack).toHaveLength(1);
    store.undo();
    expect(store.layers[0].data.flat().every((color) => color === null)).toBe(true);
    store.redo();
    expect(store.layers[0].data.flat().every((color) => color === "#ffffff")).toBe(true);
  });

  it("records eraser strokes but not picking, no-op or out-of-bounds clicks", async () => {
    const store = usePackStore();
    store.layers[0].data[0][0] = "#ffffff";
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    store.activeTool = "eyedropper";
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    store.activeTool = "eraser";
    await canvas.trigger("mousedown", { button: 0, clientX: -1, clientY: 1 });
    expect(store.historyStack).toHaveLength(0);
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    await canvas.trigger("mouseup");
    expect(store.layers[0].data[0][0]).toBeNull();
    expect(store.historyStack).toHaveLength(1);
    store.undo();
    expect(store.layers[0].data[0][0]).toBe("#ffffff");
  });

  it.each(["mouseup", "blur"])("ends a stroke on window %s", async (eventName) => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    window.dispatchEvent(new Event(eventName));
    await canvas.trigger("mousemove", { buttons: 1, clientX: 33, clientY: 1 });
    expect(store.layers[0].data[0][1]).toBeNull();
    await canvas.trigger("mousedown", { button: 0, clientX: 33, clientY: 1 });
    expect(store.historyStack).toHaveLength(2);
  });

  it("supports Ctrl+Shift+Z and does not intercept typing or unmodified keys", async () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace, { global: { plugins: [pinia] } });
    await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z" }));
    expect(store.historyStack).toHaveLength(1);
    const input = document.createElement("input");
    document.body.append(input);
    try {
      const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(store.historyStack).toHaveLength(1);
    } finally {
      input.remove();
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    const redo = new KeyboardEvent("keydown", { key: "Z", ctrlKey: true, shiftKey: true, cancelable: true });
    window.dispatchEvent(redo);
    expect(redo.defaultPrevented).toBe(true);
    expect(store.layers[0].data[0][0]).toBe("#ffffff");
    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    expect(store.layers[0].data[0][0]).toBe("#ffffff");
  });
});
