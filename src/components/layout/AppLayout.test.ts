import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import AppLayout from "./AppLayout.vue";

describe("AppLayout", () => {
  beforeEach(() => localStorage.clear());
  it("renders the editor regions and default project title", () => {
    const wrapper = mount(AppLayout);

    expect(wrapper.get("header").text()).toContain(
      "Resource pack project name",
    );
    expect(
      wrapper.find('aside[aria-label="Primary navigation"]').exists(),
    ).toBe(true);
    expect(wrapper.find('aside[aria-label="Asset explorer"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('main[aria-label="Canvas workspace"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('aside[aria-label="Tools and layers"]').exists()).toBe(
      true,
    );
  });

  it("renders content supplied to each named slot", () => {
    const wrapper = mount(AppLayout, {
      slots: {
        header: "My resource pack",
        "primary-sidebar": "Navigation tools",
        "asset-explorer": "Texture categories",
        workspace: "Pixel canvas",
        "right-panel": "Layers and palette",
      },
    });

    expect(wrapper.get("header").text()).toBe("My resource pack");
    expect(wrapper.get('aside[aria-label="Primary navigation"]').text()).toBe(
      "Navigation tools",
    );
    expect(wrapper.get('aside[aria-label="Asset explorer"]').text()).toBe(
      "Texture categories",
    );
    expect(wrapper.get('main[aria-label="Canvas workspace"]').text()).toBe(
      "Pixel canvas",
    );
    expect(wrapper.get('aside[aria-label="Tools and layers"]').text()).toBe(
      "Layers and palette",
    );
  });

  it("uses a four-panel grid with a full-width header", () => {
    const wrapper = mount(AppLayout);

    expect(wrapper.get("header").classes()).toContain("col-span-7");
    expect(wrapper.get("div").attributes("style")).toContain("64px 6px 220px 6px minmax(0,1fr) 6px 240px");
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(3);
  });

  it("resizes all sidebars with the keyboard and restores their sizes", async () => {
    const wrapper = mount(AppLayout);
    await wrapper.get('[aria-label="Resize action bar"]').trigger("keydown", { key: "ArrowRight" });
    await wrapper.get('[aria-label="Resize asset explorer"]').trigger("keydown", { key: "ArrowRight" });
    await wrapper.get('[aria-label="Resize tools panel"]').trigger("keydown", { key: "ArrowLeft" });
    expect(wrapper.get("div").attributes("style")).toContain("74px 6px 230px 6px minmax(0,1fr) 6px 250px");
    wrapper.unmount();
    const restored = mount(AppLayout);
    await restored.vm.$nextTick();
    expect(restored.get("div").attributes("style")).toContain("74px 6px 230px 6px minmax(0,1fr) 6px 250px");
    restored.unmount();
  });

  it("restores older saved widths without a navigation width", async () => {
    localStorage.setItem("openpack_layout", '{"explorer":300,"tools":200}');
    const wrapper = mount(AppLayout);
    await nextTick();
    expect(wrapper.get("div").attributes("style")).toContain("64px 6px 300px 6px minmax(0,1fr) 6px 200px");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps the canvas usable when all sidebars prefer wide sizes in a narrow window", async () => {
    localStorage.setItem("openpack_layout", '{"navigation":240,"explorer":520,"tools":520}');
    vi.stubGlobal("ResizeObserver", class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() {
        this.callback([{ contentRect: { width: 640 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    });
    const wrapper = mount(AppLayout);
    try {
      await nextTick();
      expect(wrapper.get("div").attributes("style")).toContain("102px 6px 120px 6px minmax(0,1fr) 6px 160px");
      await wrapper.get('[aria-label="Resize action bar"]').trigger("keydown", { key: "Home" });
      expect(wrapper.get('[aria-label="Resize action bar"]').attributes("aria-valuenow")).toBe("56");
      expect(wrapper.get("div").attributes("style")).toContain("56px 6px 120px 6px minmax(0,1fr) 6px 206px");
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("rejects an invalid saved action-bar width", async () => {
    localStorage.setItem("openpack_layout", '{"navigation":"wide","explorer":220,"tools":240}');
    const wrapper = mount(AppLayout);
    await nextTick();
    expect(wrapper.get('[role="alert"]').text()).toContain("Invalid panel sizes");
    expect(wrapper.get('[aria-label="Resize action bar"]').attributes("aria-valuenow")).toBe("64");
    wrapper.unmount();
  });

  it("reports invalid saved sizes instead of breaking the layout", async () => {
    localStorage.setItem("openpack_layout", '{"explorer":"wide","tools":240}');
    const wrapper = mount(AppLayout);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[role="alert"]').text()).toContain("Invalid panel sizes");
    wrapper.unmount();
  });
});
