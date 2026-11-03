import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import AssetExplorer from "./AssetExplorer.vue";
import { usePackStore } from "../../stores/packState";

describe("AssetExplorer", () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
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
});
