import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CanvasWorkspace from "./CanvasWorkspace.vue";
import { usePackStore } from "../../stores/packState";

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
    pinia = createPinia();
    setActivePinia(pinia);
    context = createCanvasContext();

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context,
    );
  });

  afterEach(() => {
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

  it("ignores non-primary clicks and coordinates outside the canvas grid", async () => {
    const wrapper = mount(CanvasWorkspace, {
      global: { plugins: [pinia] },
    });
    const canvas = wrapper.get("canvas");

    await canvas.trigger("mousedown", {
      button: 2,
      clientX: 1,
      clientY: 1,
    });
    await canvas.trigger("mousedown", {
      button: 0,
      clientX: -1,
      clientY: 1,
    });
    await canvas.trigger("mouseup");

    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it("marks the selected texture edited when painting", async () => {
    const store = usePackStore();
    const itemId = "assets/item/diamond_sword.png";
    store.loadTextures([itemId]);
    store.selectItem(itemId);

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
    store.loadTextures(["stone.png"]);
    store.selectItem("stone.png");
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
});
