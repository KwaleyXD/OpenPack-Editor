import { createPinia, setActivePinia } from "pinia";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePackStore } from "../../stores/packState";
import AssetThumbnail from "./AssetThumbnail.vue";

enableAutoUnmount(afterEach);
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  usePackStore().$dispose();
  vi.restoreAllMocks();
});

describe("edited thumbnails", () => {
  it("crops lazy animation thumbnails to a playback frame rather than squeezing the sheet", async () => {
    const item = { id: "block/fire_0.png", filePath: "block/fire_0.png", name: "fire_0.png", edited: false };
    const wrapper = mount(AssetThumbnail, { props: { item } });
    const image = wrapper.get("img");
    expect(image.attributes("style")).toContain("width: 26px");
    expect(image.attributes("style")).toContain("height: 832px");
    expect(image.attributes("style")).toContain("top: -416px");
    await wrapper.setProps({ frameIndex: 16 });
    expect(image.attributes("style")).toContain("top: 0px");
  });

  it("composites all visible saved layers and tracks active pixels including undo", async () => {
    const context: Partial<CanvasRenderingContext2D> = { clearRect: vi.fn(), fillRect: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      Object.defineProperty(context, "canvas", { value: this, configurable: true });
      return context as CanvasRenderingContext2D;
    });
    const item = {
      id: "block/stone.png", filePath: "block/stone.png", name: "stone", edited: true,
      savedLayers: [
        { id: "a", name: "Base", visible: true, data: [["#ff0000", null]] },
        { id: "b", name: "Top", visible: true, data: [[null, "#00ff0080"]] },
      ],
    };
    const wrapper = mount(AssetThumbnail, { props: { item } });
    await wrapper.vm.$nextTick();
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 14, 14);
    expect(context.fillRect).toHaveBeenCalledWith(14, 0, 14, 14);
    expect(context.globalAlpha).toBe(1);
    expect(wrapper.get("canvas").attributes("height")).toBe("14");
    const store = usePackStore();
    store.layers = item.savedLayers;
    store.activeItemId = item.id;
    store.saveHistorySnapshot();
    store.layers[1].data[0][1] = "#0000ff";
    await wrapper.vm.$nextTick();
    expect(context.fillStyle).toBe("#0000ff");
    store.undo();
    await wrapper.vm.$nextTick();
    expect(context.fillStyle).toBe("#00ff0080");
  });
});
