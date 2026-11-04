import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AppLayout from "./AppLayout.vue";

describe("AppLayout", () => {
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

    expect(wrapper.get("header").classes()).toContain("col-span-4");
    expect(wrapper.get("div").classes()).toContain(
      "grid-cols-[4rem_9.5rem_minmax(0,1fr)_9.5rem]",
    );
  });
});
