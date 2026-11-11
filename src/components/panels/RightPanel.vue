<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { usePackStore } from "../../stores/packState";
import type { DrawingTool } from "../../logic/toolLogic";
import ColorPickerPanel from "./ColorPickerPanel.vue";
import TexturePreview from "./TexturePreview.vue";
import ModalDialog from "../modals/ModalDialog.vue";
import PanelResizer from "../layout/PanelResizer.vue";

const store = usePackStore();
const previewExpanded = ref(false);
const previewHeight = ref(200);
const layersHeight = ref(160);
const activeItem = computed(() => store.categories.flatMap(({ items }) => items)
  .find(({ id }) => id === store.activeItemId));
const resetItem = ref<{ id: string; name: string; animated: boolean } | null>(null);
const resetting = ref(false);
const resetError = ref("");
let opacityEditLayer: string | null = null;

function updateOpacity(index: number, event: Event) {
  const layer = store.layers[index];
  const value = Number((event.target as HTMLInputElement).value) / 100;
  if ((layer.opacity ?? 1) === value) return;
  store.setLayerOpacity(index, value, opacityEditLayer !== layer.id);
  opacityEditLayer = layer.id;
}

function finishOpacityEdit() {
  opacityEditLayer = null;
}

function openReset() {
  if (!activeItem.value || !activeItem.value.edited || store.pendingItemId) return;
  resetItem.value = { id: activeItem.value.id, name: activeItem.value.name, animated: !!store.activeAnimation };
  resetError.value = "";
}

function closeReset() {
  if (!resetting.value) resetItem.value = null;
}

async function resetTexture() {
  if (!resetItem.value || resetting.value) return;
  resetting.value = true;
  resetError.value = "";
  try {
    const success = await store.resetActiveTexture(resetItem.value.id);
    if (success) resetItem.value = null;
    else resetError.value = "Reset was cancelled because the selected texture changed.";
  } catch (error) {
    resetError.value = error instanceof Error ? error.message : String(error);
  } finally {
    resetting.value = false;
  }
}

watch(() => store.activeItemId, (id) => {
  if (resetItem.value && resetItem.value.id !== id && !resetting.value) resetItem.value = null;
});

const tools: ReadonlyArray<{ id: DrawingTool; name: string; path: string }> = [
  { id: "select-rectangle", name: "Rectangular selection", path: "M4 4h4 M11 4h3 M17 4h3v3 M20 10v4 M20 17v3h-3 M14 20h-4 M7 20H4v-3 M4 14v-4 M4 7V4" },
  { id: "select-magic", name: "Magic wand selection", path: "m4 20 11-11 3 3L7 23Z M16 3v3 M21 7h-3 M19 2l-2 2" },
  { id: "move", name: "Move selection", path: "M12 2v20 M2 12h20 M9 5l3-3 3 3 M9 19l3 3 3-3 M5 9l-3 3 3 3 M19 9l3 3-3 3" },
  { id: "pencil", name: "Pencil", path: "m3 17 1 4 4-1L20 8l-4-4Z M14 6l4 4" },
  { id: "shade", name: "Lighten / Darken", path: "M12 3v3m0 12v3M3 12h3m12 0h3M5.64 5.64l2.12 2.12m8.48 8.48 2.12 2.12m0-12.72-2.12 2.12m-8.48 8.48-2.12 2.12M12 8a4 4 0 1 0 0 8" },
  { id: "eraser", name: "Eraser", path: "m3 14 8-10 9 7-8 10H8Z M7 10l9 7 M12 21h9" },
  { id: "bucket", name: "Paint Bucket", path: "m4 11 7-7 8 8-7 7Z M8 2l4 4 M3 11h16 M20 16q-4 5 0 5t0-5" },
  { id: "fill-all", name: "Fill All", path: "M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z M6 6h1m10 0h1M6 17h1m10 0h1" },
  { id: "eyedropper", name: "Eyedropper", path: "m14 4 6 6 M16 6l-12 12-1 3 3-1L18 8 M16 6l3-3 2 2-3 3" },
  { id: "line", name: "Line", path: "m4 20 16-16" },
  { id: "rectangle", name: "Rectangle", path: "M4 5h16v14H4Z" },
  { id: "circle", name: "Ellipse", path: "M21 12a9 7 0 1 1-18 0 9 7 0 1 1 18 0" },
  { id: "dither", name: "Dither pen", path: "M4 4h4v4H4ZM12 4h4v4h-4ZM8 8h4v4H8ZM16 8h4v4h-4ZM4 12h4v4H4ZM12 12h4v4h-4ZM8 16h4v4H8ZM16 16h4v4h-4Z" },
];
</script>

<template>
  <div class="space-y-4 bg-[#333333] p-2 text-zinc-100">
    <p v-if="store.persistenceError" role="alert" class="break-words text-xs text-red-400">
      {{ store.persistenceError }}
    </p>
    <section aria-label="Minimap preview" class="flex flex-col items-center gap-2 rounded border border-zinc-600 bg-[#292929] p-2">
      <h2 class="text-xs font-semibold">Preview</h2>
      <button
        type="button" aria-label="Expand texture preview" :aria-expanded="previewExpanded"
        class="flex w-full cursor-zoom-in items-center justify-center overflow-hidden rounded focus-visible:outline focus-visible:outline-sky-400 [&>canvas]:!max-h-full [&>canvas]:!max-w-full [&>canvas]:!w-auto"
        :style="{ height: `${previewHeight}px` }"
        @click="previewExpanded = true"
      >
        <TexturePreview />
      </button>
      <PanelResizer v-model="previewHeight" :min="64" :max="480" label="Resize preview height" horizontal />
      <p class="text-[10px] text-zinc-400">{{ store.frameWidth }} x {{ store.frameHeight }} - Click to expand</p>
      <p v-if="store.activeAnimation" class="text-[10px] text-zinc-400">Frame {{ store.activeFrameIndex + 1 }} / {{ store.activeAnimation.frames.length }}</p>
      <p v-else-if="store.activeNumberedGroup" class="text-[10px] text-zinc-400">
        Frame {{ store.activeNumberedGroup.frames.findIndex((item) => item.id === store.activeItemId) + 1 }} / {{ store.activeNumberedGroup.frames.length }}
      </p>
      <button type="button" :disabled="!activeItem?.edited || !!store.pendingItemId"
        class="w-full rounded border border-zinc-600 p-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        @click="openReset">Reset texture to default</button>
    </section>
    <ModalDialog v-if="resetItem" title="Reset texture to default" @close="closeReset">
      <div class="space-y-4">
        <p class="text-sm">Restore {{ resetItem.name }} to its bundled Minecraft default?</p>
        <p class="text-sm text-amber-300">
          This discards all edits and layers for this texture, restores its original dimensions, and clears its undo history. This cannot be undone.
          <span v-if="resetItem.animated"> All frames of this sprite sheet will be reset.</span>
        </p>
        <p v-if="resetError" role="alert" class="text-sm text-red-400">{{ resetError }}</p>
        <footer class="flex justify-end gap-2">
          <button type="button" :disabled="resetting" class="rounded px-3 py-2 hover:bg-zinc-700 disabled:opacity-50" @click="closeReset">Cancel</button>
          <button type="button" :disabled="resetting" class="rounded bg-red-800 px-3 py-2 hover:bg-red-700 disabled:opacity-50" @click="resetTexture">{{ resetting ? 'Resetting...' : 'Reset texture' }}</button>
        </footer>
      </div>
    </ModalDialog>
    <section aria-label="Drawing tools">
      <h2 class="mb-2 text-xs font-semibold">Tools</h2>
      <div class="grid grid-cols-2 gap-1">
        <button
          v-for="tool in tools"
          :key="tool.id"
          type="button"
          :aria-label="tool.name"
          :title="tool.name"
          :aria-pressed="store.activeTool === tool.id"
          class="flex justify-center rounded border p-2 focus-visible:outline focus-visible:outline-sky-400"
          :class="store.activeTool === tool.id ? 'border-sky-400 bg-sky-500/20' : 'border-zinc-600 hover:bg-zinc-700'"
          @click="store.activeTool = tool.id"
        >
          <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path :d="tool.path" />
          </svg>
        </button>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-1">
        <button type="button" :disabled="!store.selection" class="rounded border border-zinc-600 p-1 text-xs hover:bg-zinc-700 disabled:opacity-40" @click="store.copySelectedPixels()">Copy</button>
        <button type="button" :disabled="!store.clipboard || !!store.pendingItemId" class="rounded border border-zinc-600 p-1 text-xs hover:bg-zinc-700 disabled:opacity-40" @click="store.pasteSelectedPixels()">Paste</button>
      </div>
      <button type="button" aria-label="Deselect selection" title="Deselect selection (Ctrl/Cmd+D or Escape)"
        :disabled="!store.selection"
        class="mt-1 w-full rounded border border-zinc-500 p-1.5 text-xs hover:bg-zinc-700 focus-visible:outline focus-visible:outline-sky-400 disabled:opacity-40"
        @click="store.clearSelection()">Deselect selection</button>
      <p v-if="store.selectionToolError" role="alert" class="mt-1 text-xs text-red-400">{{ store.selectionToolError }}</p>
      <div v-if="store.activeTool === 'shade'" class="mt-2 flex gap-1" aria-label="Shading mode">
        <button
          type="button" aria-label="Lighten pixels" :aria-pressed="store.shadeMode === 'lighten'"
          class="flex-1 rounded border px-2 py-1 text-xs"
          :class="store.shadeMode === 'lighten' ? 'border-sky-400 bg-sky-500/20' : 'border-zinc-600 hover:bg-zinc-700'"
          @click="store.shadeMode = 'lighten'"
        >Lighten</button>
        <button
          type="button" aria-label="Darken pixels" :aria-pressed="store.shadeMode === 'darken'"
          class="flex-1 rounded border px-2 py-1 text-xs"
          :class="store.shadeMode === 'darken' ? 'border-sky-400 bg-sky-500/20' : 'border-zinc-600 hover:bg-zinc-700'"
          @click="store.shadeMode = 'darken'"
        >Darken</button>
      </div>
      <div class="mt-2 space-y-1 text-xs">
        <label class="flex items-center gap-1"><input v-model="store.shapeFilled" type="checkbox" />Filled shapes</label>
        <label class="flex items-center gap-1"><input v-model="store.symmetryHorizontal" type="checkbox" />Mirror left/right</label>
        <label class="flex items-center gap-1"><input v-model="store.symmetryVertical" type="checkbox" />Mirror top/bottom</label>
      </div>
    </section>

    <section aria-label="Layers">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-xs font-semibold">Layers</h2>
        <button type="button" aria-label="Add layer" class="rounded px-2 hover:bg-zinc-700" @click="store.addLayer()">+</button>
      </div>
      <ul class="space-y-1 overflow-y-auto" :style="{ height: `${layersHeight}px` }">
        <li
          v-for="(layer, index) in store.layers"
          :key="layer.id"
          class="flex flex-wrap items-center gap-1 rounded"
          :class="store.activeLayerIndex === index ? 'bg-sky-500/20' : 'bg-zinc-800'"
        >
          <button
            type="button"
            :aria-label="`Toggle visibility of ${layer.name}`"
            :aria-pressed="layer.visible"
            class="p-1.5"
            @click="store.toggleLayerVisibility(index)"
          >
            <svg aria-hidden="true" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 12q10-14 20 0-10 14-20 0Z" />
              <circle cx="12" cy="12" r="3" />
              <path v-if="!layer.visible" d="m3 3 18 18" />
            </svg>
          </button>
          <input
            type="range" min="0" max="100" step="1"
            :value="Math.round((layer.opacity ?? 1) * 100)"
            :aria-label="`Opacity of ${layer.name}`"
            :aria-valuetext="`${Math.round((layer.opacity ?? 1) * 100)}%`"
            :title="`Opacity: ${Math.round((layer.opacity ?? 1) * 100)}%`"
            class="w-16 min-w-0 accent-sky-400"
            @input="updateOpacity(index, $event)"
            @change="finishOpacityEdit"
            @blur="finishOpacityEdit"
          />
          <button
            type="button"
            :aria-pressed="store.activeLayerIndex === index"
            class="min-w-0 flex-1 truncate py-2 pr-1 text-left text-xs"
            @click="store.activeLayerIndex = index"
          >{{ layer.name }}</button>
          <div class="flex w-full justify-end gap-1 pb-1 pr-1">
            <button
              type="button"
              :aria-label="`Move ${layer.name} up`"
              :disabled="index === store.layers.length - 1"
              class="rounded p-1 hover:bg-zinc-600 disabled:opacity-30"
              @click="store.moveLayer(index, index + 1)"
            >
              <svg aria-hidden="true" class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="m3 10 5-5 5 5" /></svg>
            </button>
            <button
              type="button"
              :aria-label="`Move ${layer.name} down`"
              :disabled="index === 0"
              class="rounded p-1 hover:bg-zinc-600 disabled:opacity-30"
              @click="store.moveLayer(index, index - 1)"
            >
              <svg aria-hidden="true" class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="m3 6 5 5 5-5" /></svg>
            </button>
            <button
              type="button"
              :aria-label="`Delete ${layer.name}`"
              :disabled="store.layers.length === 1"
              class="rounded p-1 hover:bg-red-900 disabled:opacity-30"
              @click="store.deleteLayer(index)"
            >
              <svg aria-hidden="true" class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M2 4h12M6 4V2h4v2M4 4l1 10h6l1-10M7 6v6m2-6v6" /></svg>
            </button>
          </div>
        </li>
      </ul>
      <PanelResizer v-model="layersHeight" :min="64" :max="480" label="Resize layers height" horizontal />
      <label class="mt-3 block text-xs">
        Onion skin: {{ ['Off', 'Previous frame', 'Previous and next frames', 'Next frame'][store.onionSkinRange] }}
        <input v-model.number="store.onionSkinRange" aria-label="Onion skin range" type="range" min="0" max="3" step="1" class="mt-1 w-full" />
      </label>
      <p class="mt-1 text-[10px] text-zinc-400">1: previous; 2: both; 3: next. Animation frames only; previews and exports stay clean.</p>
    </section>

    <ColorPickerPanel />
    <ModalDialog v-if="previewExpanded" title="Texture preview" wide @close="previewExpanded = false">
      <TexturePreview expanded />
      <p class="mt-3 text-center text-xs text-zinc-400">{{ store.frameWidth }} x {{ store.frameHeight }} pixels</p>
    </ModalDialog>
  </div>
</template>
