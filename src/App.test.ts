import { createPinia } from "pinia";
import { nextTick } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import { usePackStore } from "./stores/packState";
import { DEFAULT_TEXTURE_PATHS } from "./logic/assetManifest";

enableAutoUnmount(afterEach);

describe("application startup", () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    localStorage.clear();
    pinia = createPinia();
    const context: Partial<CanvasRenderingContext2D> = {
      canvas: document.createElement("canvas"),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
      globalAlpha: 1,
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as CanvasRenderingContext2D);
  });

  afterEach(() => {
    usePackStore(pinia).$dispose();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("initializes the starter categories and mounts every panel on first launch", async () => {
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    await nextTick();
    const store = usePackStore(pinia);
    expect(store.categories.flatMap(({ items }) => items).map(({ filePath }) => filePath).sort())
      .toEqual([...DEFAULT_TEXTURE_PATHS].sort());
    expect(wrapper.get("h1").text()).toBe("My Custom Pack");
    expect(wrapper.find('nav[aria-label="Project actions"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Swords");
    expect(wrapper.find('canvas[aria-label="16 by 16 pixel texture editor"]').exists()).toBe(true);
    expect(wrapper.find('canvas[aria-label="Texture minimap"]').exists()).toBe(true);
  });

  it("restores a saved project instead of replacing its assets with defaults", () => {
    const store = usePackStore(pinia);
    store.packName = "Saved project";
    store.loadTextures(["block/stone.png"]);
    store.saveProjectLocal();
    store.packName = "Changed in memory";
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    expect(wrapper.get("h1").text()).toBe("Changed in memory");
    expect(store.categories.flatMap(({ items }) => items)).toHaveLength(1);
    // A new app/store instance performs restoration before its panels mount.
    const restoredPinia = createPinia();
    const restored = usePackStore(restoredPinia);
    try {
      const restoredWrapper = mount(App, { global: { plugins: [restoredPinia] } });
      expect(restoredWrapper.get("h1").text()).toBe("Saved project");
      expect(restored.categories.flatMap(({ items }) => items)).toHaveLength(1);
    } finally {
      restored.$dispose();
    }
  });

  it("preserves intentionally empty saved projects", () => {
    usePackStore(pinia).saveProjectLocal();
    mount(App, { global: { plugins: [pinia] } });
    expect(usePackStore(pinia).categories).toEqual([]);
  });

  it("surfaces corrupt saves without overwriting them or initializing defaults", () => {
    localStorage.setItem("openpack_save", "broken save");
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    expect(wrapper.get('[role="alert"]').text()).toContain("Unable to restore project locally");
    expect(usePackStore(pinia).categories).toEqual([]);
    expect(localStorage.getItem("openpack_save")).toBe("broken save");
  });

  it("shows blocked-storage errors without crashing startup", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    expect(wrapper.get('[role="alert"]').text()).toContain("Storage blocked");
    expect(wrapper.find('canvas[aria-label="Texture minimap"]').exists()).toBe(true);
  });
});
