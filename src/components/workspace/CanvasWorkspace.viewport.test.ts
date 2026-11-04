import { createPinia, setActivePinia } from "pinia";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CanvasWorkspace from "./CanvasWorkspace.vue";
import { usePackStore } from "../../stores/packState";

enableAutoUnmount(afterEach);

async function wheel(element: Element, options: WheelEventInit) {
  element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ...options }));
  await nextTick();
}

describe("canvas viewport controls", () => {
  it("lightens exactly the hovered cell without changing pixels or undo history", async () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace);
    const before = JSON.stringify(store.layers);
    await wrapper.get("canvas").trigger("mouseenter", { clientX: 70, clientY: 100 });
    const highlight = wrapper.get('[data-testid="pixel-hover"]');
    expect(highlight.attributes("style")).toContain("left: 64px");
    expect(highlight.attributes("style")).toContain("top: 96px");
    expect(highlight.attributes("style")).toContain("width: 32px");
    expect(highlight.attributes("style")).toContain("height: 32px");
    expect(highlight.classes()).toContain("bg-white/25");
    expect(highlight.classes()).toContain("pointer-events-none");
    expect(JSON.stringify(store.layers)).toBe(before);
    expect(store.historyStack).toEqual([]);
    await wrapper.get("canvas").trigger("mousemove", { clientX: -10, clientY: 100 });
    expect(wrapper.find('[data-testid="pixel-hover"]').exists()).toBe(false);
    await wrapper.get("canvas").trigger("mousemove", { clientX: 70, clientY: 100 });
    await wrapper.get("canvas").trigger("mouseleave");
    expect(wrapper.find('[data-testid="pixel-hover"]').exists()).toBe(false);
  });

  it("aligns hover with zoomed pixels and hides it during navigation or window blur", async () => {
    const wrapper = mount(CanvasWorkspace);
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousemove", { clientX: 100, clientY: 100 });
    await wheel(wrapper.element, { deltaY: -Math.log(2) / 0.0015, clientX: 100, clientY: 100 });
    const highlight = wrapper.get('[data-testid="pixel-hover"]');
    expect(highlight.attributes("style")).toContain("left: 92px");
    expect(highlight.attributes("style")).toContain("top: 92px");
    expect(highlight.attributes("style")).toContain("width: 64px");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    await nextTick();
    expect(wrapper.find('[data-testid="pixel-hover"]').exists()).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
    await nextTick();
    expect(wrapper.find('[data-testid="pixel-hover"]').exists()).toBe(true);
    await canvas.trigger("mousedown", { button: 1, clientX: 100, clientY: 100 });
    expect(wrapper.find('[data-testid="pixel-hover"]').exists()).toBe(false);
    window.dispatchEvent(new Event("blur"));
    await nextTick();
    expect(wrapper.find('[data-testid="pixel-hover"]').exists()).toBe(false);
  });

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    const context: Partial<CanvasRenderingContext2D> = {
      clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      Object.defineProperty(context, "canvas", { value: this, configurable: true });
      return context as CanvasRenderingContext2D;
    });
  });

  afterEach(() => {
    usePackStore().$dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("starts at 100%, zooms below 1% without a lower UI limit, and does not change pixel history", async () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace);
    const viewport = wrapper.get('[aria-label="Zoom and pan canvas"]');
    expect(wrapper.get('[aria-label="Zoom level"]').text()).toBe("100%");
    for (let i = 0; i < 4; i += 1) {
      await wheel(viewport.element, { deltaY: -1000, clientX: 256, clientY: 256 });
    }
    expect(wrapper.get('[aria-label="Zoom level"]').text()).toBe("1600%");
    for (let i = 0; i < 12; i += 1) {
      await wheel(viewport.element, { deltaY: 1000, clientX: 256, clientY: 256 });
    }
    const percent = parseFloat(wrapper.get('[aria-label="Zoom level"]').text());
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThan(0.001);
    expect(store.historyStack).toEqual([]);
    expect(store.layers[0].data.flat().every((color) => color === null)).toBe(true);
  });

  it.each([false, true])("keeps the cursor over the same pixel during wheel/pinch zoom (ctrl: %s)", async (ctrlKey) => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace);
    await wheel(wrapper.get('[aria-label="Zoom and pan canvas"]').element, {
      deltaY: -Math.log(2) / 0.0015, clientX: 100, clientY: 100, ctrlKey,
    });
    expect(wrapper.get('[aria-label="Zoom level"]').text()).toBe("200%");
    await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 100, clientY: 100 });
    await wrapper.get("canvas").trigger("mouseup", { clientX: 100, clientY: 100 });
    expect(store.layers[0].data[3][3]).toBe("#ffffff");
    expect(store.layers[0].data.flat().filter((color) => color !== null)).toHaveLength(1);
  });

  it.each([0, 1])("pans with %s button (Space for left) without drawing, then maps drawing through the pan", async (button) => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace);
    if (button === 0) window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", cancelable: true }));
    await wrapper.get("canvas").trigger("mousedown", { button, clientX: 20, clientY: 20 });
    window.dispatchEvent(new MouseEvent("mousemove", {
      buttons: button === 1 ? 4 : 1, clientX: 84, clientY: 52,
    }));
    window.dispatchEvent(new MouseEvent("mouseup", { button, clientX: 84, clientY: 52 }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
    expect(store.historyStack).toEqual([]);
    expect(store.layers[0].data.flat().every((color) => color === null)).toBe(true);
    await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 65, clientY: 33 });
    expect(store.layers[0].data[0][0]).toBe("#ffffff");
    expect(store.layers[0].data[1][2]).toBeNull();
  });

  it("stops a pan and releases Space on window blur", async () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX: 100, clientY: 100 }));
    await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    expect(store.layers[0].data[0][0]).toBe("#ffffff");
  });

  it("allows Space-drag after selecting a tool button without stealing normal button activation", async () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace, { attachTo: document.body });
    const button = document.createElement("button");
    document.body.append(button);
    try {
      button.focus();
      const event = new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 10, clientY: 10 });
      expect(document.activeElement).toBe(wrapper.get("canvas").element);
      window.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX: 74, clientY: 42 }));
      window.dispatchEvent(new MouseEvent("mouseup"));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
      await nextTick();
      expect(store.historyStack).toEqual([]);
      expect(wrapper.get(".alpha-checkerboard").attributes("style")).toContain("left: 64px");
    } finally {
      button.remove();
    }
  });

  it("does not steal Space or history shortcuts from an open modal or text field", () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace);
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const input = document.createElement("input");
    document.body.append(dialog, input);
    const undo = vi.spyOn(store, "undo");
    try {
      const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true });
      window.dispatchEvent(event);
      expect(undo).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      dialog.remove();
      const space = new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true });
      input.dispatchEvent(space);
      expect(space.defaultPrevented).toBe(false);
      expect(wrapper.get("canvas").classes()).not.toContain("cursor-grab");
    } finally {
      dialog.remove();
      input.remove();
    }
  });

  it("uses the available viewport size, centers the alpha checkerboard and disconnects resize tracking", async () => {
    let notify = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { notify = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const wrapper = mount(CanvasWorkspace);
    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
    notify();
    await wrapper.vm.$nextTick();
    expect(wrapper.get("canvas").attributes("width")).toBe("800");
    expect(wrapper.get("canvas").attributes("height")).toBe("600");
    const checker = wrapper.get(".alpha-checkerboard").attributes("style");
    expect(checker).toContain("left: 144px");
    expect(checker).toContain("top: 44px");
    await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 145, clientY: 45 });
    expect(usePackStore().layers[0].data[0][0]).toBe("#ffffff");
    wrapper.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("provides zoom buttons and restores a centered view without altering the texture", async () => {
    const wrapper = mount(CanvasWorkspace);
    await wrapper.get('[aria-label="Zoom in"]').trigger("click");
    expect(wrapper.get('[aria-label="Zoom level"]').text()).toBe("125%");
    await wrapper.get('[aria-label="Zoom out"]').trigger("click");
    expect(wrapper.get('[aria-label="Zoom level"]').text()).toBe("100%");
    await wrapper.get('[aria-label="Zoom in"]').trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "Reset view")?.trigger("click");
    expect(wrapper.get('[aria-label="Zoom level"]').text()).toBe("100%");
    expect(wrapper.get(".alpha-checkerboard").attributes("style")).toContain("left: 0px");
    expect(usePackStore().historyStack).toEqual([]);
  });
});
