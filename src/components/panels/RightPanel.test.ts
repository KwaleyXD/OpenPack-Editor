import { createPinia } from "pinia";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RightPanel from "./RightPanel.vue";
import { usePackStore } from "../../stores/packState";

enableAutoUnmount(afterEach);
afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

function mountPanel() {
  const pinia = createPinia();
  const store = usePackStore(pinia);
  const wrapper = mount(RightPanel, { global: { plugins: [pinia] } });
  return { store, wrapper };
}

describe("RightPanel", () => {
  let context: CanvasRenderingContext2D;

  beforeEach(() => {
    localStorage.clear();
    const mockContext: Partial<CanvasRenderingContext2D> = {
      canvas: document.createElement("canvas"),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      globalAlpha: 1,
      fillStyle: "",
      strokeStyle: "",
    };
    context = mockContext as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
      close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
    });
  });

  afterEach(() => {
    usePackStore().$dispose();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders a sidebar-width minimap without a grid and redraws pixel changes", async () => {
    const { store, wrapper } = mountPanel();
    const canvas = wrapper.get('canvas[aria-label="Texture minimap"]');
    expect(canvas.attributes("width")).toBe("256");
    expect(canvas.attributes("height")).toBe("256");
    expect(canvas.classes()).toContain("w-full");
    expect(context.clearRect).toHaveBeenCalledOnce();
    expect(context.strokeRect).not.toHaveBeenCalled();
    expect(context.imageSmoothingEnabled).toBe(false);
    store.layers[0].data[2][3] = "#123456";
    await wrapper.vm.$nextTick();
    expect(context.fillRect).toHaveBeenCalledWith(48, 32, 16, 16);
    expect(context.fillStyle).toBe("#123456");
  });

  it("keeps resized textures inside the preview and redraws history and visibility changes", async () => {
    const { store, wrapper } = mountPanel();
    store.layers[0].data[15][15] = "#abcdef";
    store.resizeCanvas(32);
    await wrapper.vm.$nextTick();
    expect(context.fillRect).toHaveBeenCalledWith(248, 248, 8, 8);
    store.undo();
    await wrapper.vm.$nextTick();
    expect(context.fillRect).toHaveBeenLastCalledWith(240, 240, 16, 16);
    vi.mocked(context.fillRect).mockClear();
    store.toggleLayerVisibility(0);
    await wrapper.vm.$nextTick();
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it("follows active-layer/onion changes and stops its watcher after unmount", async () => {
    const { store, wrapper } = mountPanel();
    store.layers[0].data[0][0] = "#abcdef";
    store.addLayer();
    await wrapper.vm.$nextTick();
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 16, 16);
    store.onionSkinRange = 1;
    await wrapper.vm.$nextTick();
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 16, 16);
    const calls = vi.mocked(context.clearRect).mock.calls.length;
    store.activeLayerIndex = 0;
    await wrapper.vm.$nextTick();
    expect(context.clearRect).toHaveBeenCalledTimes(calls + 1);
    wrapper.unmount();
    store.layers[0].data[0][0] = "#ffffff";
    await wrapper.vm.$nextTick();
    expect(context.clearRect).toHaveBeenCalledTimes(calls + 1);
  });

  it("preserves wide/tall preview proportions and opens a larger live preview on click", async () => {
    const { store, wrapper } = mountPanel();
    store.resizeCanvasAdvanced(64, 16, "top-left", false);
    await wrapper.vm.$nextTick();
    const thumbnail = wrapper.get('canvas[aria-label="Texture minimap"]');
    expect([thumbnail.attributes("width"), thumbnail.attributes("height")]).toEqual(["256", "64"]);
    await wrapper.get('[aria-label="Expand texture preview"]').trigger("click");
    expect(wrapper.get("dialog").attributes("open")).toBeDefined();
    expect(wrapper.get("dialog").classes()).toContain("w-[min(90vw,72rem)]");
    const large = wrapper.get('canvas[aria-label="Expanded texture preview"]');
    expect([large.attributes("width"), large.attributes("height")]).toEqual(["1024", "256"]);
    expect(wrapper.get('[aria-label="Expand texture preview"]').attributes("aria-expanded")).toBe("true");
    vi.mocked(context.fillRect).mockClear();
    store.layers[0].data[0][0] = "#12345680";
    await wrapper.vm.$nextTick();
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 4, 4);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 16, 16);
    store.resizeCanvasAdvanced(16, 64, "top-left", false);
    await wrapper.vm.$nextTick();
    expect([large.attributes("width"), large.attributes("height")]).toEqual(["256", "1024"]);
    await wrapper.get("dialog").trigger("keydown", { key: "Escape" });
    expect(wrapper.find("dialog").exists()).toBe(false);
    expect(wrapper.get('[aria-label="Expand texture preview"]').attributes("aria-expanded")).toBe("false");
  });

  it("surfaces minimap initialization and persistence errors", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    const { store, wrapper } = mountPanel();
    store.persistenceError = "Unable to save project locally: quota exceeded";
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Unable to initialize the minimap 2D context.");
    expect(wrapper.text()).toContain("quota exceeded");
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(2);
  });

  it("selects each tool and highlights only the active tool", async () => {
    const { store, wrapper } = mountPanel();
    for (const [name, tool] of [
      ["Eraser", "eraser"], ["Paint Bucket", "bucket"], ["Fill All", "fill-all"],
      ["Eyedropper", "eyedropper"], ["Pencil", "pencil"],
    ]) {
      const button = wrapper.get(`button[aria-label="${name}"]`);
      await button.trigger("click");
      expect(store.activeTool).toBe(tool);
      expect(button.attributes("aria-pressed")).toBe("true");
      expect(wrapper.findAll('section[aria-label="Drawing tools"] button[aria-pressed="true"]')).toHaveLength(1);
    }
  });

  it("adds an independent blank layer, selects layers, and toggles visibility", async () => {
    const { store, wrapper } = mountPanel();
    await wrapper.get('button[aria-label="Add layer"]').trigger("click");
    expect(store.layers).toHaveLength(2);
    expect(store.activeLayerIndex).toBe(1);
    expect(store.layers[1].data).toHaveLength(16);
    expect(store.layers[1].data.flat().every((color) => color === null)).toBe(true);
    expect(store.layers[0].id).not.toBe(store.layers[1].id);
    store.layers[1].data[0][0] = "#ff0000";
    expect(store.layers[0].data[0][0]).toBeNull();

    await wrapper.get('button[aria-label="Toggle visibility of Layer 2"]').trigger("click");
    expect(store.layers[1].visible).toBe(false);
    expect(store.activeLayerIndex).toBe(1);
    const layerButton = wrapper.findAll("li button").find((button) => button.text() === "Layer 1");
    expect(layerButton).toBeDefined();
    await layerButton!.trigger("click");
    expect(store.activeLayerIndex).toBe(0);
    expect(layerButton!.attributes("aria-pressed")).toBe("true");
  });

  it("selects palette and custom colors", async () => {
    const { store, wrapper } = mountPanel();
    const colorButton = wrapper.get('button[aria-label="Select color #795548"]');
    await colorButton.trigger("click");
    expect(store.activeColor).toBe("#795548");
    expect(colorButton.attributes("aria-pressed")).toBe("true");
    await wrapper.get('input[type="color"]').setValue("#abcdef");
    expect(store.activeColor).toBe("#abcdef");
    expect(colorButton.attributes("aria-pressed")).toBe("false");
  });

  it("moves layers up/down and disables invalid moves and deletion of the last layer", async () => {
    const { store, wrapper } = mountPanel();
    expect(wrapper.get('button[aria-label="Delete Layer 1"]').attributes("disabled")).toBeDefined();
    await wrapper.get('button[aria-label="Add layer"]').trigger("click");
    expect(wrapper.get('button[aria-label="Move Layer 2 up"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('button[aria-label="Move Layer 1 down"]').attributes("disabled")).toBeDefined();
    await wrapper.get('button[aria-label="Move Layer 1 up"]').trigger("click");
    expect(store.layers.map(({ name }) => name)).toEqual(["Layer 2", "Layer 1"]);
    expect(store.activeLayerIndex).toBe(0);
    await wrapper.get('button[aria-label="Move Layer 1 down"]').trigger("click");
    expect(store.layers.map(({ name }) => name)).toEqual(["Layer 1", "Layer 2"]);
    await wrapper.get('button[aria-label="Delete Layer 2"]').trigger("click");
    expect(store.layers).toHaveLength(1);
    expect(store.activeLayerIndex).toBe(0);
    expect(wrapper.get('button[aria-label="Delete Layer 1"]').attributes("disabled")).toBeDefined();
  });

  it("binds the onion skin slider as a number without creating history", async () => {
    const { store, wrapper } = mountPanel();
    const slider = wrapper.get('input[aria-label="Onion skin range"]');
    expect(slider.attributes("min")).toBe("0");
    expect(slider.attributes("max")).toBe("3");
    expect(slider.attributes("step")).toBe("1");
    await slider.setValue("3");
    expect(store.onionSkinRange).toBe(3);
    expect(wrapper.text()).toContain("Onion skin: Next frame");
    expect(store.historyStack).toEqual([]);
  });
});
