import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AssetExplorer from "./AssetExplorer.vue";
import { usePackStore } from "../../stores/packState";
import { parsePngToGrid } from "../../engine/imageLoader";

vi.mock("../../engine/imageLoader", () => ({ parsePngToGrid: vi.fn() }));

describe("AssetExplorer", () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    vi.mocked(parsePngToGrid).mockReset();
    vi.mocked(parsePngToGrid).mockImplementation(async (_url, width, height = width) =>
      Array.from({ length: height }, () => Array<null>(width).fill(null)));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      return { canvas: this, clearRect: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    });
  });

  afterEach(() => {
    usePackStore(pinia).$dispose();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows an empty state when no textures are loaded", () => {
    const wrapper = mount(AssetExplorer, {
      global: { plugins: [pinia] },
    });
    expect(wrapper.text()).toContain("No textures loaded");
  });

  it("loads real thumbnail URLs lazily and reports image failures", async () => {
    const store = usePackStore();
    store.loadTextures(["assets/minecraft/textures/block/stone.png"]);
    const wrapper = mount(AssetExplorer);
    await wrapper.get('button[aria-expanded]').trigger("click");
    const image = wrapper.get("img");
    expect(image.attributes("src")).toBe("/vanilla_base/block/stone.png");
    expect(image.attributes("loading")).toBe("lazy");
    expect(image.attributes("decoding")).toBe("async");
    await image.trigger("error");
    expect(wrapper.get('[role="img"]').attributes("aria-label")).toContain("Unable to load preview");
    await wrapper.get('button[title="assets/minecraft/textures/block/stone.png"]').trigger("click");
    await flushPromises();
    expect(wrapper.find("canvas").exists()).toBe(true);
    expect(wrapper.find('[title^="Unable to load preview"]').exists()).toBe(false);
    wrapper.unmount();
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

  it("expands an animation into selectable frames while counting it as one texture", async () => {
    const store = usePackStore();
    store.loadTextures(["block/lantern.png"]);
    const wrapper = mount(AssetExplorer);
    await wrapper.get('button[aria-expanded]').trigger("click");
    const toggle = wrapper.get('[aria-label="Expand frames of lantern.png"]');
    expect(store.categoryProgress(store.categories[0].id).total).toBe(1);
    expect(wrapper.find('[aria-label="Frames of lantern.png"]').exists()).toBe(false);
    await toggle.trigger("click");
    expect(wrapper.get('[aria-label="Frames of lantern.png"]').findAll("button")).toHaveLength(3);
    expect(parsePngToGrid).not.toHaveBeenCalled();
    await wrapper.get('[aria-label="lantern.png: frame 3"]').trigger("click");
    await flushPromises();
    expect(store.activeItemId).toBe("block/lantern.png");
    expect(store.activeFrameIndex).toBe(2);
    expect(wrapper.get('[aria-label="lantern.png: frame 3"]').attributes("aria-current")).toBe("true");
    expect(store.historyStack).toEqual([]);
    await toggle.trigger("click");
    expect(wrapper.find('[aria-label="Frames of lantern.png"]').exists()).toBe(false);
    wrapper.unmount();
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
