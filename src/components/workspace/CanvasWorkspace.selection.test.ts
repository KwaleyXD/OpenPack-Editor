import { createPinia, setActivePinia } from "pinia";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CanvasWorkspace from "./CanvasWorkspace.vue";
import RightPanel from "../panels/RightPanel.vue";
import { usePackStore } from "../../stores/packState";
import { parsePngToGrid } from "../../engine/imageLoader";
import type { PixelColor } from "../../engine/canvasEngine";

vi.mock("../../engine/imageLoader", () => ({
  parsePngToGrid: vi.fn(async (_url: string, width: number, height = width) =>
    Array.from({ length: height }, () => Array<PixelColor>(width).fill(null))),
}));
enableAutoUnmount(afterEach);

describe("selection and clipboard", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      return { canvas: this, clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), save: vi.fn(), restore: vi.fn() } as unknown as CanvasRenderingContext2D;
    });
  });
  afterEach(() => {
    usePackStore().$dispose();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function drag(canvas: ReturnType<ReturnType<typeof mount>["get"]>, x1: number, y1: number, x2: number, y2: number) {
    await canvas.trigger("mousedown", { button: 0, clientX: x1 * 32 + 1, clientY: y1 * 32 + 1 });
    await canvas.trigger("mousemove", { buttons: 1, clientX: x2 * 32 + 1, clientY: y2 * 32 + 1 });
    await canvas.trigger("mouseup", { clientX: x2 * 32 + 1, clientY: y2 * 32 + 1 });
  }

  it("selects and moves active-layer pixels with an undoable drag", async () => {
    const store = usePackStore();
    store.layers[0].data[0][0] = "#ff0000";
    store.layers[0].data[0][1] = "#00ff00";
    const wrapper = mount(CanvasWorkspace);
    const panel = mount(RightPanel);
    await panel.get('[aria-label="Rectangular selection"]').trigger("click");
    await drag(wrapper.get("canvas"), 0, 0, 1, 0);
    expect(wrapper.find('[data-testid="selection-outline"]').exists()).toBe(true);
    expect(store.historyStack).toHaveLength(0);
    await panel.get('[aria-label="Move selection"]').trigger("click");
    await drag(wrapper.get("canvas"), 0, 0, 2, 1);
    expect(store.layers[0].data[0].slice(0, 2)).toEqual([null, null]);
    expect(store.layers[0].data[1].slice(2, 4)).toEqual(["#ff0000", "#00ff00"]);
    expect(store.historyStack).toHaveLength(1);
    store.undo();
    expect(store.layers[0].data[0].slice(0, 2)).toEqual(["#ff0000", "#00ff00"]);
    expect(store.selection).toBeNull();
    store.redo();
    expect(store.layers[0].data[1].slice(2, 4)).toEqual(["#ff0000", "#00ff00"]);
  });

  it("deselects a moved selection and copies a different area without changing the pixels", async () => {
    const store = usePackStore();
    store.layers[0].data[0][0] = "#ff0000";
    store.layers[0].data[0][4] = "#00ff00";
    const wrapper = mount(CanvasWorkspace);
    const panel = mount(RightPanel);
    const canvas = wrapper.get("canvas");
    const deselect = panel.get('[aria-label="Deselect selection"]');
    expect(deselect.attributes("disabled")).toBeDefined();
    await panel.get('[aria-label="Rectangular selection"]').trigger("click");
    await drag(canvas, 0, 0, 0, 0);
    store.copySelectedPixels();
    await panel.get('[aria-label="Move selection"]').trigger("click");
    await drag(canvas, 0, 0, 1, 0);
    expect(deselect.attributes("disabled")).toBeUndefined();
    await deselect.trigger("click");
    expect(store.selection).toBeNull();
    expect(wrapper.find('[data-testid="selection-outline"]').exists()).toBe(false);
    expect(store.layers[0].data[0][1]).toBe("#ff0000");
    expect(store.clipboard?.pixels).toEqual([["#ff0000"]]);
    await panel.get('[aria-label="Rectangular selection"]').trigger("click");
    await drag(canvas, 4, 0, 4, 0);
    await panel.findAll("button").find((button) => button.text() === "Copy")!.trigger("click");
    expect(store.clipboard?.pixels).toEqual([["#00ff00"]]);
  });

  it("clears the selection with Ctrl+D and preserves native shortcuts in text fields", async () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace);
    store.selection = { x: 0, y: 0, mask: [[true]] };
    const event = new KeyboardEvent("keydown", { key: "d", ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(store.selection).toBeNull();
    expect(wrapper.find('[data-testid="selection-outline"]').exists()).toBe(false);
    store.selection = { x: 0, y: 0, mask: [[true]] };
    const input = document.createElement("input");
    document.body.append(input);
    const textEvent = new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(textEvent);
    expect(textEvent.defaultPrevented).toBe(false);
    expect(store.selection).not.toBeNull();
    input.remove();
  });

  it("copies between sprites and repositions a paste without damaging its original landing area", async () => {
    const store = usePackStore();
    store.loadTextures(["item/clock_00.png", "item/clock_01.png"]);
    await store.selectItem("item/clock_00.png");
    store.layers[0].data[0][0] = "#ff0000";
    store.layers[0].data[0][1] = "#00ff00";
    const wrapper = mount(CanvasWorkspace);
    const panel = mount(RightPanel);
    await panel.get('[aria-label="Rectangular selection"]').trigger("click");
    await drag(wrapper.get("canvas"), 0, 0, 1, 0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }));
    await store.selectItem("item/clock_01.png");
    store.layers[0].data[0][0] = "#0000ff";
    store.layers[0].data[0][1] = "#abcdef";
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }));
    expect(store.activeTool).toBe("move");
    expect(store.layers[0].data[0].slice(0, 2)).toEqual(["#ff0000", "#00ff00"]);
    await drag(wrapper.get("canvas"), 0, 0, 2, 1);
    expect(store.layers[0].data[0].slice(0, 2)).toEqual(["#0000ff", "#abcdef"]);
    expect(store.layers[0].data[1].slice(2, 4)).toEqual(["#ff0000", "#00ff00"]);
    expect(store.historyStack).toHaveLength(1);
    expect(store.getEditedItems().map(({ id }) => id)).toEqual(["clock_01"]);
    store.undo();
    expect(store.layers[0].data[1].slice(2, 4)).toEqual([null, null]);
    expect(store.layers[0].data[0].slice(0, 2)).toEqual(["#0000ff", "#abcdef"]);
    store.redo();
    expect(store.layers[0].data[1].slice(2, 4)).toEqual(["#ff0000", "#00ff00"]);
    expect(store.saveProjectLocal()).toBe(true);
    expect(store.loadProjectLocal()).toBe(true);
    expect(store.layers[0].data[1].slice(2, 4)).toEqual(["#ff0000", "#00ff00"]);
  });

  it("magic-selects connected pixels without selecting diagonal pixels", async () => {
    const store = usePackStore();
    store.layers[0].data[0][0] = "#ff0000";
    store.layers[0].data[1][0] = "#ff0000";
    store.layers[0].data[1][1] = "#00ff00";
    store.layers[0].data[2][1] = "#ff0000";
    const wrapper = mount(CanvasWorkspace);
    store.activeTool = "select-magic";
    await wrapper.get("canvas").trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    expect(store.selection).toEqual({ x: 0, y: 0, mask: [[true], [true]] });
  });

  it("does not intercept text input shortcuts or paste onto hidden or oversized layers", async () => {
    const store = usePackStore();
    const wrapper = mount(CanvasWorkspace, { attachTo: document.body });
    store.selection = { x: 0, y: 0, mask: [[true, true]] };
    store.layers[0].data[0][0] = "#ff0000";
    store.copySelectedPixels();
    const input = document.createElement("input");
    document.body.append(input);
    const event = new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    store.layers[0].visible = false;
    expect(store.pasteSelectedPixels()).toBe(false);
    expect(store.selectionToolError).toContain("visible layer");
    store.layers[0].visible = true;
    store.clipboard = { pixels: [Array(17).fill("#ffffff")], mask: [Array(17).fill(true)] };
    expect(store.pasteSelectedPixels()).toBe(false);
    expect(store.selectionToolError).toContain("larger");
    input.remove();
    wrapper.unmount();
  });

  it("copies and pastes only the selected sprite-sheet frame", async () => {
    const store = usePackStore();
    store.loadTextures(["block/lantern.png"]);
    await store.selectItem("block/lantern.png");
    store.layers[0].data[0][0] = "#abcdef";
    const wrapper = mount(CanvasWorkspace);
    store.activeTool = "select-rectangle";
    await drag(wrapper.get("canvas"), 0, 0, 0, 0);
    store.copySelectedPixels();
    store.selectFrame(1);
    expect(store.selection).toBeNull();
    expect(store.pasteSelectedPixels()).toBe(true);
    await drag(wrapper.get("canvas"), 0, 0, 2, 1);
    expect(store.layers[0].data[0][0]).toBe("#abcdef");
    expect(store.layers[0].data[17][2]).toBe("#abcdef");
    expect(store.layers[0].data[16][0]).toBeNull();
  });

  it("preserves destination pixels under transparent copied pixels across repeated moves", async () => {
    const store = usePackStore();
    store.layers[0].data[0][0] = "#ff0000";
    const wrapper = mount(CanvasWorkspace);
    store.activeTool = "select-rectangle";
    await drag(wrapper.get("canvas"), 0, 0, 1, 0);
    store.copySelectedPixels();
    store.layers[0].data[0][1] = "#123456";
    store.layers[0].data[1][3] = "#abcdef";
    store.pasteSelectedPixels();
    await drag(wrapper.get("canvas"), 0, 0, 2, 1);
    expect(store.layers[0].data[0][1]).toBe("#123456");
    expect(store.layers[0].data[1][2]).toBe("#ff0000");
    expect(store.layers[0].data[1][3]).toBe("#abcdef");
    await drag(wrapper.get("canvas"), 2, 1, 4, 2);
    expect(store.layers[0].data[1][2]).toBeNull();
    expect(store.layers[0].data[1][3]).toBe("#abcdef");
    expect(store.layers[0].data[2][4]).toBe("#ff0000");
    store.undo();
    expect(store.layers[0].data[2][4]).toBeNull();
    expect(store.layers[0].data[0][0]).toBe("#ff0000");
  });

  it("does not commit a move preview when Escape cancels the drag", async () => {
    const store = usePackStore();
    store.layers[0].data[0][0] = "#ff0000";
    const wrapper = mount(CanvasWorkspace);
    store.activeTool = "select-rectangle";
    await drag(wrapper.get("canvas"), 0, 0, 0, 0);
    store.activeTool = "move";
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 0, clientX: 1, clientY: 1 });
    await canvas.trigger("mousemove", { buttons: 1, clientX: 65, clientY: 1 });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await canvas.trigger("mouseup", { clientX: 65, clientY: 1 });
    expect(store.layers[0].data[0].slice(0, 3)).toEqual(["#ff0000", null, null]);
    expect(store.historyStack).toHaveLength(0);
    expect(store.selection).toBeNull();
  });

  it("commits a pasted selection before right-click erasing", async () => {
    const store = usePackStore();
    store.layers[0].data[0][0] = "#ff0000";
    const wrapper = mount(CanvasWorkspace);
    store.activeTool = "select-rectangle";
    await drag(wrapper.get("canvas"), 0, 0, 0, 0);
    store.copySelectedPixels();
    store.pasteSelectedPixels();
    const canvas = wrapper.get("canvas");
    await canvas.trigger("mousedown", { button: 2, clientX: 1, clientY: 1 });
    await canvas.trigger("mouseup", { clientX: 1, clientY: 1 });
    expect(store.pastedBase).toBeNull();
    expect(store.layers[0].data[0][0]).toBeNull();
  });
});
