import { createPinia } from "pinia";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrimarySidebar from "./PrimarySidebar.vue";
import { usePackStore } from "../../stores/packState";
import { buildPackZip } from "../../engine/exportEngine";
import { initGrid } from "../../engine/canvasEngine";
import { importResourcePack } from "../../logic/packImporter";

vi.mock("../../engine/exportEngine", () => ({ buildPackZip: vi.fn() }));
vi.mock("../../logic/packImporter", () => ({ importResourcePack: vi.fn() }));
vi.mock("../../engine/imageLoader", () => ({
  parsePngToGrid: vi.fn(async (_url: string, size: number) => initGrid(size)),
}));
enableAutoUnmount(afterEach);
afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

function mountSidebar() {
  const pinia = createPinia();
  const store = usePackStore(pinia);
  const wrapper = mount(PrimarySidebar, { global: { plugins: [pinia] } });
  return { store, wrapper };
}

describe("PrimarySidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(buildPackZip).mockReset();
    vi.mocked(importResourcePack).mockReset().mockResolvedValue();
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
      close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
    });
  });

  afterEach(() => {
    usePackStore().$dispose();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows settings and opens the resize modal without changing the active texture first", async () => {
    const { store, wrapper } = mountSidebar();
    await wrapper.get('button[aria-label="Settings"]').trigger("click");
    expect(wrapper.get('[role="status"]').text()).toContain("not available yet");
    await wrapper.get('button[aria-label="Resize canvas"]').trigger("click");
    expect([store.width, store.height]).toEqual([16, 16]);
    await wrapper.get('input[type="number"]').setValue("32");
    await wrapper.get('form').trigger("submit");
    expect([store.width, store.height]).toEqual([32, 32]);
    expect(wrapper.get('[role="status"]').text()).toContain("32 by 32");
  });

  it("exports cached and live edited textures with the project metadata", async () => {
    const { store, wrapper } = mountSidebar();
    store.packName = "Test Pack";
    store.packDescription = "Test description";
    store.loadTextures(["block/stone.png", "item/diamond_sword.png"]);
    await store.selectItem("block/stone.png");
    store.layers[0].data[0][0] = "#123456";
    store.markItemEdited(store.activeItemId);
    await store.selectItem("item/diamond_sword.png");
    store.layers[0].data[0][0] = "#abcdef";
    store.markItemEdited(store.activeItemId);
    vi.mocked(buildPackZip).mockResolvedValue(new Blob());
    await wrapper.get('button[aria-label="Export Pack"]').trigger("click");
    await flushPromises();
    expect(buildPackZip).toHaveBeenCalledWith(
      "Test Pack", store.getEditedItems(), 34, "Test description",
    );
    expect(wrapper.get('[role="status"]').text()).toContain("download started");
  });

  it("locks proportions, supports custom dimensions and commits anchored crop/pad as one undo step", async () => {
    const { store, wrapper } = mountSidebar();
    store.layers[0].data[0][0] = "#12345680";
    await wrapper.get('button[aria-label="Resize canvas"]').trigger("click");
    const dimensions = wrapper.findAll<HTMLInputElement>('input[type="number"]');
    await dimensions[0].setValue("32");
    expect(dimensions[1].element.value).toBe("32");
    await wrapper.get('[aria-label="Lock proportions"]').trigger("click");
    await dimensions[1].setValue("20");
    await wrapper.get('[aria-label="Anchor bottom-right"]').trigger("click");
    expect(wrapper.get('[aria-label="Anchor bottom-right"]').attributes("aria-pressed")).toBe("true");
    await wrapper.get("form").trigger("submit");
    expect([store.width, store.height]).toEqual([32, 20]);
    expect(store.layers[0].data[4][16]).toBe("#12345680");
    expect(store.layers[0].data[0][0]).toBeNull();
    expect(store.historyStack).toHaveLength(1);
    expect(wrapper.find("dialog").exists()).toBe(false);
    store.undo();
    expect([store.width, store.height]).toEqual([16, 16]);
    expect(store.layers[0].data[0][0]).toBe("#12345680");
    store.redo();
    expect([store.width, store.height]).toEqual([32, 20]);
  });

  it("scales content with nearest neighbors and disables the irrelevant anchor grid", async () => {
    const { store, wrapper } = mountSidebar();
    store.layers[0].data[0][0] = "#123456";
    await wrapper.get('button[aria-label="Resize canvas"]').trigger("click");
    await wrapper.get('input[type="number"]').setValue("32");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(wrapper.get("fieldset").attributes("disabled")).toBeDefined();
    await wrapper.get("form").trigger("submit");
    expect(store.layers[0].data[1][1]).toBe("#123456");
    expect(store.layers[0].data[2][2]).toBeNull();
  });

  it("cancels resize with Cancel or Escape and reports invalid dimensions without mutations", async () => {
    const { store, wrapper } = mountSidebar();
    await wrapper.get('button[aria-label="Resize canvas"]').trigger("click");
    await wrapper.get('input[type="number"]').setValue("0");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get('[role="alert"]').text()).toContain("positive integers");
    expect(store.historyStack).toEqual([]);
    await wrapper.get("dialog").trigger("cancel");
    expect(wrapper.find("dialog").exists()).toBe(false);
    await wrapper.get('button[aria-label="Resize canvas"]').trigger("click");
    await wrapper.get('input[type="number"]').setValue("64");
    await wrapper.get("dialog").trigger("keydown", { key: "Escape" });
    expect(wrapper.find("dialog").exists()).toBe(false);
    await wrapper.get('button[aria-label="Resize canvas"]').trigger("click");
    const cancel = wrapper.findAll("button").find((button) => button.text() === "Cancel");
    await cancel?.trigger("click");
    expect(wrapper.find("dialog").exists()).toBe(false);
    expect([store.width, store.height]).toEqual([16, 16]);
  });

  it("requires explicit replacement confirmation before creating a new pack", async () => {
    const { store, wrapper } = mountSidebar();
    store.packName = "Old pack";
    store.layers[0].data[0][0] = "#ffffff";
    await wrapper.get('button[aria-label="Create new pack"]').trigger("click");
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    await wrapper.get("form").trigger("submit");
    expect(store.packName).toBe("Old pack");
    expect(wrapper.get('[role="alert"]').text()).toContain("Confirm replacement");
    await wrapper.get("dialog").get("input").setValue("Fresh pack");
    await wrapper.get("textarea").setValue("New description");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find("dialog").exists()).toBe(false);
    expect(store.packName).toBe("Fresh pack");
    expect(store.packDescription).toBe("New description");
    expect(store.packFormat).toBe(34);
    expect(store.categories.length).toBeGreaterThan(0);
    expect(store.layers[0].data[0][0]).toBeNull();
    expect(wrapper.get('[role="status"]').text()).toBe("New pack created.");
  });

  it("requires confirmation and a ZIP before importing a replacement pack", async () => {
    const { store, wrapper } = mountSidebar();
    store.packName = "Keep this";
    await wrapper.get('button[aria-label="Import pack"]').trigger("click");
    expect(wrapper.find("dialog").exists()).toBe(true);
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    const fileInput = wrapper.get('input[type="file"]').element as HTMLInputElement;
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [new File(["zip"], "pack.zip", { type: "application/zip" })],
    });
    await wrapper.get('input[type="file"]').trigger("change");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get('[role="alert"]').text()).toContain("Confirm replacement");
    expect(importResourcePack).not.toHaveBeenCalled();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(importResourcePack).toHaveBeenCalledOnce();
    expect(importResourcePack).toHaveBeenCalledWith(expect.objectContaining({ name: "pack.zip" }));
    expect(wrapper.find("dialog").exists()).toBe(false);
    expect(store.packName).toBe("Keep this");
    expect(wrapper.get('[role="status"]').text()).toContain("Pack imported");
  });

  it("surfaces new-pack storage errors and preserves the existing project when removal fails", async () => {
    const { store, wrapper } = mountSidebar();
    store.packName = "Keep this";
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    await wrapper.get('button[aria-label="Create new pack"]').trigger("click");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Storage blocked");
    expect(store.packName).toBe("Keep this");
    expect(wrapper.find("dialog").exists()).toBe(true);
  });

  it("blocks repeated exports while pending and surfaces failures", async () => {
    const { wrapper } = mountSidebar();
    let rejectExport!: (error: Error) => void;
    vi.mocked(buildPackZip).mockImplementation(() => new Promise((_resolve, reject) => {
      rejectExport = reject;
    }));
    const button = wrapper.get('button[aria-label="Export Pack"]');
    await button.trigger("click");
    expect(button.attributes("disabled")).toBeDefined();
    await button.trigger("click");
    expect(buildPackZip).toHaveBeenCalledOnce();
    rejectExport(new Error("Encoding failed"));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Encoding failed");
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("reports invalid asset paths before attempting a download", async () => {
    const { store, wrapper } = mountSidebar();
    store.loadTextures(["stone.png"]);
    store.markItemEdited("stone.png");
    await wrapper.get('button[aria-label="Export Pack"]').trigger("click");
    expect(wrapper.get('[role="alert"]').text()).toContain("no saved pixel data");
    expect(buildPackZip).not.toHaveBeenCalled();
  });
});
