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

  it("filters textures case-insensitively within their original categories without changing progress", async () => {
    const store = usePackStore();
    const swordId = "assets/item/diamond_sword.png";
    const pickaxeId = "assets/item/diamond_pickaxe.png";
    store.loadTextures([swordId, "assets/item/iron_sword.png", pickaxeId, "assets/item/apple.png"]);
    store.markItemEdited(swordId);
    const categoryIds = store.categories.map(({ id }) => id);
    const wrapper = mount(AssetExplorer, { global: { plugins: [pinia] } });

    expect(wrapper.get("input").attributes("type")).toBe("search");
    await wrapper.get('input[type="search"]').setValue("  DIAMOND  ");
    const categoryButtons = wrapper.findAll('button[aria-expanded]');
    expect(categoryButtons).toHaveLength(2);
    expect(categoryButtons.map((button) => button.text())).toEqual([
      expect.stringContaining("Swords"),
      expect.stringContaining("Pickaxes"),
    ]);
    expect(categoryButtons[0].text()).toContain("1/2");
    expect(wrapper.find("li").exists()).toBe(false);
    for (const button of categoryButtons) await button.trigger("click");
    expect(wrapper.findAll("li")).toHaveLength(2);
    expect(wrapper.find(`button[title="${swordId}"]`).exists()).toBe(true);
    expect(wrapper.find(`button[title="${pickaxeId}"]`).exists()).toBe(true);
    expect(wrapper.text()).not.toContain("iron_sword.png");
    expect(wrapper.text()).not.toContain("Food & Consumables");
    expect(store.categories.map(({ id }) => id)).toEqual(categoryIds);
    expect(store.categories.flatMap(({ items }) => items)).toHaveLength(4);

    await wrapper.get(`button[title="${swordId}"]`).trigger("click");
    await flushPromises();
    expect(store.activeItemId).toBe(swordId);
    expect(wrapper.get(`button[title="${swordId}"]`).attributes("aria-current")).toBe("true");
    wrapper.unmount();
  });

  it("matches texture paths and restores category expansion when the search is cleared", async () => {
    const store = usePackStore();
    const swordId = "assets/item/diamond_sword.png";
    const stoneId = "assets/block/stone.png";
    store.loadTextures([swordId, stoneId]);
    const wrapper = mount(AssetExplorer, { global: { plugins: [pinia] } });
    const swordCategory = wrapper.findAll('button[aria-expanded]')
      .find((button) => button.text().includes("Swords"))!;
    await swordCategory.trigger("click");
    expect(wrapper.find(`button[title="${swordId}"]`).exists()).toBe(true);

    await wrapper.get('input[type="search"]').setValue("ASSETS/BLOCK/");
    expect(wrapper.findAll('button[aria-expanded]')).toHaveLength(1);
    expect(wrapper.find(`button[title="${swordId}"]`).exists()).toBe(false);
    await wrapper.get('button[aria-expanded]').trigger("click");
    expect(wrapper.find(`button[title="${stoneId}"]`).exists()).toBe(true);

    await wrapper.get('[aria-label="Clear texture search"]').trigger("click");
    expect(wrapper.get<HTMLInputElement>('input[type="search"]').element.value).toBe("");
    expect(wrapper.findAll('button[aria-expanded]')).toHaveLength(2);
    expect(wrapper.find(`button[title="${swordId}"]`).exists()).toBe(true);
    expect(wrapper.find(`button[title="${stoneId}"]`).exists()).toBe(true);
    expect(wrapper.find('[aria-label="Clear texture search"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows a no-match state and treats whitespace-only searches as empty", async () => {
    const store = usePackStore();
    store.loadTextures(["block/stone.png"]);
    const wrapper = mount(AssetExplorer, { global: { plugins: [pinia] } });
    await wrapper.get('input[type="search"]').setValue("missing texture");
    expect(wrapper.get('[role="status"]').text()).toBe("No textures match your search");
    expect(wrapper.find('button[aria-expanded]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("No textures loaded");

    await wrapper.get('input[type="search"]').setValue("   ");
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-expanded]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("expands an animation into selectable frames while counting it as one texture", async () => {
    const store = usePackStore();
    store.loadTextures(["block/lantern.png"]);
    const wrapper = mount(AssetExplorer);
    await wrapper.get('input[type="search"]').setValue("lantern");
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

  it("groups numbered item frames, searches their filenames, and selects their original files", async () => {
    const store = usePackStore();
    store.loadTextures(["item/clock_10.png", "item/clock_02.png", "item/compass_00.png", "item/compass_01.png"]);
    const wrapper = mount(AssetExplorer);
    expect(store.categoryProgress("misc-tools").total).toBe(2);
    await wrapper.get('input[type="search"]').setValue("clock_10");
    await wrapper.get('button[aria-expanded]').trigger("click");
    expect(wrapper.text()).toContain("clock.png");
    await wrapper.get('[aria-label="Expand frames of clock.png"]').trigger("click");
    const frames = wrapper.get('[aria-label="Frames of clock.png"]');
    expect(frames.findAll("button").map((button) => button.text())).toEqual(["clock_02.png", "clock_10.png"]);
    await wrapper.get('[aria-label="clock.png: frame 2"]').trigger("click");
    await flushPromises();
    expect(store.activeItemId).toBe("item/clock_10.png");
    expect(wrapper.get('[aria-label="clock.png: frame 2"]').attributes("aria-current")).toBe("true");
    store.layers[0].data[0][0] = "#123456";
    store.markItemEdited(store.activeItemId);
    await wrapper.get('[aria-label="clock.png: frame 1"]').trigger("click");
    await flushPromises();
    expect(store.getEditedItems()).toMatchObject([{ id: "clock_10", categoryPath: "item", width: 16, height: 16 }]);
    expect(store.getEditedItems()[0].layers[0].data[0][0]).toBe("#123456");
    expect(store.saveProjectLocal()).toBe(true);
    expect(store.loadProjectLocal()).toBe(true);
    expect(store.getEditedItems()[0].layers[0].data[0][0]).toBe("#123456");
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
