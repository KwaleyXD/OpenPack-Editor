import { createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RightPanel from "./RightPanel.vue";
import { usePackStore } from "../../stores/packState";

function mountPanel() {
  const pinia = createPinia();
  const store = usePackStore(pinia);
  const wrapper = mount(RightPanel, { global: { plugins: [pinia] } });
  return { store, wrapper };
}

describe("RightPanel", () => {
  it("selects each tool and highlights only the active tool", async () => {
    const { store, wrapper } = mountPanel();
    for (const [name, tool] of [
      ["Eraser", "eraser"], ["Paint Bucket", "bucket"],
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
});
