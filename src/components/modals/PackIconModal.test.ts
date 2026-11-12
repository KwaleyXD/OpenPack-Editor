import { createPinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PackIconModal from "./PackIconModal.vue";
import { usePackStore } from "../../stores/packState";

describe("PackIconModal", () => {
  let context: CanvasRenderingContext2D;
  const stores: ReturnType<typeof usePackStore>[] = [];

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
      close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } },
    });
    context = { filter: "none", drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA");
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = vi.fn(() => "blob:icon-test");
      static revokeObjectURL = vi.fn();
    });
    vi.stubGlobal("Image", class {
      naturalWidth = 128;
      naturalHeight = 64;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
  });

  afterEach(() => {
    for (const store of stores.splice(0)) store.$dispose();
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("previews filter settings and applies a centered 64-pixel PNG", async () => {
    const pinia = createPinia();
    const store = usePackStore(pinia);
    stores.push(store);
    const wrapper = mount(PackIconModal, { global: { plugins: [pinia] } });
    const imageInput = wrapper.get('input[aria-label="Choose icon image"]');
    Object.defineProperty(imageInput.element, "files", {
      configurable: true,
      value: [new File(["image"], "icon.png", { type: "image/png" })],
    });
    await imageInput.trigger("change");
    await flushPromises();
    await wrapper.get('input[aria-label="Icon brightness"]').setValue("150");
    await wrapper.findAll("button").find((button) => button.text() === "Apply icon")!.trigger("click");

    expect(context.filter).toContain("brightness(150%)");
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.anything(), 32, 0, 64, 64, 0, 0, 64, 64,
    );
    expect(store.packIconDataUrl).toBe("data:image/png;base64,AAAA");
    expect(wrapper.emitted("applied")).toHaveLength(1);
  });
});
