import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PanelResizer from "./PanelResizer.vue";

describe("panel dividers", () => {
  it.each([false, true])("supports clamped pointer dragging (horizontal: %s)", async (horizontal) => {
    const wrapper = mount(PanelResizer, {
      props: { modelValue: 200, min: 100, max: 400, label: "Resize", horizontal },
    });
    wrapper.element.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 90, clientY: 90 }));
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([280]);
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 1000, clientY: 1000 }));
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([400]);
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    expect(wrapper.emitted("change")).toHaveLength(1);
    const count = wrapper.emitted("update:modelValue")?.length;
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 10, clientY: 10 }));
    expect(wrapper.emitted("update:modelValue")).toHaveLength(count!);
    wrapper.unmount();
  });

  it("releases an active drag when unmounted", async () => {
    const wrapper = mount(PanelResizer, { props: { modelValue: 200, min: 100, max: 400, label: "Resize" } });
    wrapper.element.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1 }));
    wrapper.unmount();
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 100 }));
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});
