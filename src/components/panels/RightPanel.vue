<script setup lang="ts">
import { ref } from "vue";
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

const tools: ReadonlyArray<{ id: DrawingTool; name: string; path: string }> = [
  { id: "pencil", name: "Pencil", path: "m3 17 1 4 4-1L20 8l-4-4Z M14 6l4 4" },
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
    </section>
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
