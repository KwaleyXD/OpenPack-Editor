import { createPinia, setActivePinia } from "pinia";
import { mount, enableAutoUnmount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ColorPickerPanel from "./ColorPickerPanel.vue";
import { usePackStore } from "../../stores/packState";

enableAutoUnmount(afterEach);

describe("advanced color management", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    usePackStore().$dispose();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("keeps the most recent ten unique canonical colors from all assignments", () => {
    const store = usePackStore();
    for (let i = 0; i < 12; i += 1) {
      store.setActiveColor(`#${i.toString(16).padStart(6, "0")}`);
    }
    expect(store.recentColors).toHaveLength(10);
    expect(store.recentColors[0]).toBe("#00000b");
    expect(store.recentColors).not.toContain("#000000");
    store.setActiveColor("#00000AFF");
    expect(store.recentColors[0]).toBe("#00000a");
    expect(new Set(store.recentColors).size).toBe(10);
    store.activeColor = "#ABCDEF80";
    expect(store.recentColors[0]).toBe("#abcdef80");
    expect(() => store.setActiveColor("bad")).toThrow();
    expect(store.activeColor).toBe("#ABCDEF80");
  });

  it("selects presets and recent swatches", async () => {
    const store = usePackStore();
    const wrapper = mount(ColorPickerPanel);
    await wrapper.get('[aria-label="Select color #795548"]').trigger("click");
    expect(store.activeColor).toBe("#795548");
    expect(wrapper.find('[aria-label="Recent color #795548"]').exists()).toBe(true);
    await wrapper.get("select").setValue("wool");
    await wrapper.get('[aria-label="Select color #f07613"]').trigger("click");
    expect(store.activeColor).toBe("#f07613");
    await wrapper.get('[aria-label="Recent color #795548"]').trigger("click");
    expect(store.activeColor).toBe("#795548");
    expect(store.recentColors[0]).toBe("#795548");
  });

  it("clears recent colors without changing the active color", async () => {
    const store = usePackStore();
    store.setActiveColor("#123456");
    const wrapper = mount(ColorPickerPanel);

    await wrapper.get('[aria-label="Clear recent colors"]').trigger("click");

    expect(store.recentColors).toEqual([]);
    expect(store.activeColor).toBe("#123456");
    expect(wrapper.find('[aria-label="Clear recent colors"]').exists()).toBe(false);
    expect(wrapper.findAll('[aria-label^="Recent color "]')).toHaveLength(0);
  });

  it("validates hex without changing the color or history on invalid input", async () => {
    const store = usePackStore();
    const wrapper = mount(ColorPickerPanel);
    const input = wrapper.get<HTMLInputElement>('input[type="text"]');
    await input.setValue("#12345g");
    expect(wrapper.get('[role="alert"]').text()).toContain("6- or 8-digit");
    expect(store.activeColor).toBe("#ffffff");
    expect(store.recentColors).toEqual([]);
    await input.setValue("ABCDEF80");
    expect(store.activeColor).toBe("#abcdef80");
    expect(input.element.value).toBe("#abcdef80");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(store.recentColors).toEqual(["#abcdef80"]);
  });

  it("preserves alpha through the native RGB picker and exposes precise RGBA bytes", async () => {
    const store = usePackStore();
    store.setActiveColor("#12345680");
    const wrapper = mount(ColorPickerPanel);
    expect(wrapper.get<HTMLInputElement>('input[type="color"]').element.value).toBe("#123456");
    await wrapper.get('input[type="color"]').setValue("#abcdef");
    expect(store.activeColor).toBe("#abcdef80");
    const inputs = wrapper.findAll<HTMLInputElement>('input[type="number"]');
    expect(inputs.map((input) => input.element.value)).toEqual(["171", "205", "239", "128"]);
    await inputs[0].setValue("1");
    expect(store.activeColor).toBe("#01cdef80");
    await inputs[3].setValue("0");
    expect(store.activeColor).toBe("#01cdef00");
    await inputs[3].setValue("255");
    expect(store.activeColor).toBe("#01cdef");
    await inputs[1].setValue("256");
    expect(store.activeColor).toBe("#01cdef");
    expect(wrapper.get('[role="alert"]').text()).toContain("0 to 255");
    await inputs[1].setValue("1.5");
    expect(store.activeColor).toBe("#01cdef");
    await inputs[1].setValue("");
    expect(store.activeColor).toBe("#01cdef");
  });

  it("adds only the confirmed custom color instead of filling recent colors with picker adjustments", async () => {
    const store = usePackStore();
    const earlierColors = Array.from({ length: 10 }, (_, i) => `#${(i + 1).toString(16).padStart(6, "0")}`);
    earlierColors.forEach((color) => store.setActiveColor(color));
    const before = [...store.recentColors];
    const wrapper = mount(ColorPickerPanel);
    const picker = wrapper.get<HTMLInputElement>('input[type="color"]');

    for (let i = 0; i < 30; i++) {
      picker.element.value = `#aabb${i.toString(16).padStart(2, "0")}`;
      await picker.trigger("input");
    }
    expect(store.recentColors).toEqual(before);
    expect(store.activeColor).toBe(before[0]);

    picker.element.value = "#aabbcc";
    await picker.trigger("change");
    expect(store.activeColor).toBe("#aabbcc");
    expect(store.recentColors).toEqual(["#aabbcc", ...before.slice(0, 9)]);
    expect(wrapper.findAll('[aria-label^="Recent color "]').map((swatch) => swatch.attributes("title")))
      .toEqual(store.recentColors);

    picker.element.value = "#aabbcd";
    await picker.trigger("input");
    picker.element.value = "#ddeeff";
    await picker.trigger("change");
    expect(store.recentColors).toEqual(["#ddeeff", "#aabbcc", ...before.slice(0, 8)]);
    await wrapper.get('[aria-label="Recent color #aabbcc"]').trigger("click");
    expect(store.activeColor).toBe("#aabbcc");
    expect(store.recentColors).toEqual(["#aabbcc", "#ddeeff", ...before.slice(0, 8)]);
  });

  it("saves a named recent-color palette and reloads it into a new store", async () => {
    const store = usePackStore();
    store.setActiveColor("#abcdef80");
    store.setActiveColor("#123456");
    const wrapper = mount(ColorPickerPanel);
    await wrapper.get("form input").setValue("My ramp");
    await wrapper.get("form").trigger("submit");
    expect(store.customPalettes[0]).toMatchObject({
      name: "My ramp", colors: ["#123456", "#abcdef80"],
    });
    expect(wrapper.get('[aria-label="Select palette My ramp"]').attributes("aria-pressed")).toBe("true");
    store.$dispose();
    setActivePinia(createPinia());
    const restored = usePackStore();
    expect(restored.customPalettes[0].name).toBe("My ramp");
    expect(restored.customPalettes[0].colors).toEqual(["#123456", "#abcdef80"]);
  });

  it("deletes a custom palette from the list and persisted storage", async () => {
    const store = usePackStore();
    store.saveCustomPalette("Keep", ["#123456"]);
    store.saveCustomPalette("Remove", ["#abcdef"]);
    const [keep] = store.customPalettes;
    const wrapper = mount(ColorPickerPanel);
    await wrapper.get('[aria-label="Delete palette Remove"]').trigger("click");

    expect(store.customPalettes).toEqual([keep]);
    expect(JSON.parse(localStorage.getItem("openpack_palettes") ?? "[]")).toEqual([keep]);
    expect(wrapper.find('[aria-label="Delete palette Remove"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Select palette Keep"]').exists()).toBe(true);

    await wrapper.get(`[aria-label="Delete palette ${keep.name}"]`).trigger("click");
    expect(store.customPalettes).toEqual([]);
    expect(localStorage.getItem("openpack_palettes")).toBe("[]");
  });

  it("reports storage errors without removing a custom palette", async () => {
    const store = usePackStore();
    store.saveCustomPalette("Ramp", ["#123456"]);
    const wrapper = mount(ColorPickerPanel);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });

    await wrapper.get('[aria-label="Delete palette Ramp"]').trigger("click");

    expect(store.customPalettes).toHaveLength(1);
    expect(wrapper.get('[role="alert"]').text()).toContain("Unable to delete custom palette");
    expect(wrapper.get('[role="alert"]').text()).toContain("Storage full");
  });

  it("reports invalid custom palette storage and does not silently overwrite it", () => {
    localStorage.setItem("openpack_palettes", "bad");
    const store = usePackStore();
    const wrapper = mount(ColorPickerPanel);
    expect(wrapper.get('[role="alert"]').text()).toContain("Unable to load custom palettes");
    expect(store.customPalettes).toEqual([]);
    expect(localStorage.getItem("openpack_palettes")).toBe("bad");
  });

  it("reports validation and quota errors without claiming to save a palette", async () => {
    const store = usePackStore();
    const wrapper = mount(ColorPickerPanel);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get('[role="alert"]').text()).toContain("needs a name");
    expect(store.customPalettes).toEqual([]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    expect(store.saveCustomPalette("Ramp", ["#ffffff"])).toBe(false);
    await nextTick();
    expect(store.customPalettes).toEqual([]);
    expect(wrapper.get('[role="alert"]').text()).toContain("Storage full");
  });
});
