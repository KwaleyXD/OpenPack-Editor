<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import PanelResizer from "./PanelResizer.vue";

const root = ref<HTMLDivElement | null>(null);
const width = ref(window.innerWidth);
const navigationWidth = ref(64);
const explorerWidth = ref(220);
const toolsWidth = ref(240);
const error = ref("");
const navigationMax = computed(() => Math.max(56, Math.min(240, width.value - 18 - 120 - 160 - 240)));
const navigationSize = computed(() => Math.min(navigationWidth.value, navigationMax.value));
const explorerMax = computed(() => Math.max(120, Math.min(520, width.value - navigationSize.value - 18 - 240 - toolsSize.value)));
const toolsMax = computed(() => Math.max(160, Math.min(520, width.value - navigationSize.value - 18 - 240 - 120)));
const toolsSize = computed(() => Math.min(toolsWidth.value, toolsMax.value));
const explorerSize = computed(() => Math.min(explorerWidth.value, explorerMax.value));
let observer: ResizeObserver | undefined;
function saveSizes() {
  try {
    localStorage.setItem("openpack_layout", JSON.stringify({
      navigation: navigationWidth.value, explorer: explorerWidth.value, tools: toolsWidth.value,
    }));
    error.value = "";
  } catch (cause) {
    error.value = `Unable to save panel sizes: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}
onMounted(() => {
  try {
    const saved = localStorage.getItem("openpack_layout");
    if (saved) {
      const sizes = JSON.parse(saved);
      if (!Number.isFinite(sizes.explorer) || !Number.isFinite(sizes.tools) ||
        (sizes.navigation !== undefined && !Number.isFinite(sizes.navigation))) throw new Error("Invalid panel sizes.");
      navigationWidth.value = Math.max(56, Math.min(240, sizes.navigation ?? 64));
      explorerWidth.value = Math.max(120, Math.min(520, sizes.explorer));
      toolsWidth.value = Math.max(160, Math.min(520, sizes.tools));
    }
  } catch (cause) {
    error.value = `Unable to restore panel sizes: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
  if (typeof ResizeObserver !== "undefined" && root.value) {
    observer = new ResizeObserver(([entry]) => { width.value = entry.contentRect.width; });
    observer.observe(root.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div
    ref="root"
    class="grid h-dvh min-h-[360px] min-w-[640px] grid-rows-[2.5rem_minmax(0,1fr)] overflow-hidden bg-[#292929] text-zinc-100"
    :style="{ gridTemplateColumns: `${navigationSize}px 6px ${explorerSize}px 6px minmax(0,1fr) 6px ${toolsSize}px` }"
  >
    <header
      class="col-span-7 flex min-w-0 items-center gap-2 border-b border-zinc-600 bg-[#3a3a3a] px-3"
    >
      <img src="/logo.png" alt="OpenPack Studio" class="h-6 w-6 shrink-0 [image-rendering:pixelated]" />
      <slot name="header">
        <span class="truncate text-sm">Resource pack project name</span>
      </slot>
      <p v-if="error" role="alert" class="ml-auto truncate text-xs text-red-400" :title="error">{{ error }}</p>
    </header>

    <aside
      aria-label="Primary navigation"
      class="row-start-2 min-h-0 overflow-y-auto border-r border-zinc-600 bg-[#333333]"
    >
      <slot name="primary-sidebar" />
    </aside>

    <PanelResizer :model-value="navigationSize" :min="56" :max="navigationMax" label="Resize action bar"
      class="row-start-2" @update:model-value="navigationWidth = $event" @change="saveSizes" />
    <aside
      aria-label="Asset explorer"
      class="row-start-2 min-h-0 overflow-y-auto border-r border-zinc-600 bg-[#3a3a3a]"
    >
      <slot name="asset-explorer" />
    </aside>

    <PanelResizer :model-value="explorerSize" :min="120" :max="explorerMax" label="Resize asset explorer"
      class="row-start-2" @update:model-value="explorerWidth = $event" @change="saveSizes" />
    <main
      aria-label="Canvas workspace"
      class="row-start-2 flex min-h-0 min-w-0 overflow-hidden bg-[#292929]"
    >
      <slot name="workspace" />
    </main>

    <PanelResizer :model-value="toolsSize" :min="160" :max="toolsMax" label="Resize tools panel" reverse
      class="row-start-2" @update:model-value="toolsWidth = $event" @change="saveSizes" />
    <aside
      aria-label="Tools and layers"
      class="row-start-2 min-h-0 overflow-y-auto border-l border-zinc-600 bg-[#3a3a3a]"
    >
      <slot name="right-panel" />
    </aside>
  </div>
</template>
