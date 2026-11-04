import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AssetExplorer from "./AssetExplorer.vue";
import { usePackStore } from "../../stores/packState";
import { initGrid } from "../../engine/canvasEngine";
import { parsePngToGrid } from "../../engine/imageLoader";

vi.mock("../../engine/imageLoader", () => ({ parsePngToGrid: vi.fn() }));

describe("AssetExplorer", () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    vi.mocked(parsePngToGrid).mockReset();
    vi.mocked(parsePngToGrid).mockImplementation(async (_url, size) => initGrid(size));
  });

  afterEach(() => {
    usePackStore(pinia).$dispose();
    localStorage.clear();
  });

  it("shows an empty state when no textures are loaded", () => {
    const wrapper = mount(AssetExplorer, {
      global: { plugins: [pinia] },
    });

    expect(wrapper.text()).toContain("No textures loaded");
  });

  it("renders category progress and toggles its item list", async () => {
    const store = usePackStore();
    store.loadTextures([
      "assets/item/diamond_sword.png",
      "assets/item/iron_sword.png",
    ]);

    const wrapper = mount(AssetExplorer, {
      global: { plugins: [pinia] },
    });
    const categoryButton = wrapper.get('button[aria-expanded]');

    expect(wrapper.text()).toContain("Swords");
    expect(wrapper.text()).toContain("0/2");
    expect(wrapper.find("li").exists()).toBe(false);

    await categoryButton.trigger("click");

    expect(categoryButton.attributes("aria-expanded")).toBe("true");
    expect(wrapper.findAll("li")).toHaveLength(2);
    expect(wrapper.text()).toContain("diamond_sword.png");

    await categoryButton.trigger("click");
    expect(wrapper.find("li").exists()).toBe(false);
  });

  it("selects and highlights the clicked texture", async () => {
    const store = usePackStore();
    const itemId = "assets/item/diamond_sword.png";
    store.loadTextures([itemId]);

    const wrapper = mount(AssetExplorer, {
      global: { plugins: [pinia] },
    });
    await wrapper.get('button[aria-expanded]').trigger("click");
    const itemButton = wrapper.get(`button[title="${itemId}"]`);

    await itemButton.trigger("click");
    await flushPromises();

    expect(store.activeItemId).toBe(itemId);
    expect(itemButton.attributes("aria-current")).toBe("true");
    expect(itemButton.classes()).toContain("bg-sky-500/20");
  });

  it("shows an edited indicator for completed textures", async () => {
    const store = usePackStore();
    const itemId = "assets/item/diamond_sword.png";
    store.loadTextures([itemId]);
    store.markItemEdited(itemId);

    const wrapper = mount(AssetExplorer, {
      global: { plugins: [pinia] },
    });

    expect(wrapper.find('[aria-label="Edited"]').exists()).toBe(false);

    await wrapper.get('button[aria-expanded]').trigger("click");

    expect(wrapper.find('[aria-label="Edited"]').exists()).toBe(true);
  });

  it("renders category completion as a proportional progress bar", () => {
    const store = usePackStore();
    store.loadTextures([
      "assets/item/diamond_sword.png",
      "assets/item/iron_sword.png",
    ]);
    store.markItemEdited("assets/item/diamond_sword.png");

    const wrapper = mount(AssetExplorer, {
      global: { plugins: [pinia] },
    });
    const progressBarStyle = wrapper.get(".h-1 > div").attributes("style");

    expect(progressBarStyle).toContain("width: 50%");
    expect(progressBarStyle).toContain("rgb(249, 115, 22)");
  });

  it("shows loading state and handles failed image loads with a retry", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png"]);
    let rejectLoad!: (error: Error) => void;
    vi.mocked(parsePngToGrid).mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectLoad = reject;
    }));
    const wrapper = mount(AssetExplorer, { global: { plugins: [pinia] } });
    await wrapper.get('button[aria-expanded]').trigger("click");
    const item = wrapper.get('button[title="block/stone.png"]');
    await item.trigger("click");
    expect(wrapper.get('[role="status"]').text()).toContain("Loading");
    expect(item.attributes("aria-busy")).toBe("true");
    rejectLoad(new Error("PNG is missing"));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("PNG is missing");
    expect(store.activeItemId).toBe("");
    await item.trigger("click");
    await flushPromises();
    expect(store.activeItemId).toBe("block/stone.png");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
