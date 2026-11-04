<script setup lang="ts">
import { usePackStore } from "../../stores/packState";
import type { DrawingTool } from "../../logic/toolLogic";

const store = usePackStore();
const tools: ReadonlyArray<{ id: DrawingTool; name: string; path: string }> = [
  { id: "pencil", name: "Pencil", path: "m3 17 1 4 4-1L20 8l-4-4Z M14 6l4 4" },
  { id: "eraser", name: "Eraser", path: "m3 14 8-10 9 7-8 10H8Z M7 10l9 7 M12 21h9" },
  { id: "bucket", name: "Paint Bucket", path: "m4 11 7-7 8 8-7 7Z M8 2l4 4 M3 11h16 M20 16q-4 5 0 5t0-5" },
  { id: "eyedropper", name: "Eyedropper", path: "m14 4 6 6 M16 6l-12 12-1 3 3-1L18 8 M16 6l3-3 2 2-3 3" },
];
const palette: readonly string[] = [
  "#ffffff", "#b0b0b0", "#606060", "#181818",
  "#795548", "#a08050", "#d6c28a", "#567d46",
  "#305c32", "#249c93", "#3b6bcc", "#8a55b5",
  "#e34b40", "#ef8c32", "#f4d35e", "#ee8cb4",
];
</script>

<template>
  <div class="space-y-4 bg-[#333333] p-2 text-zinc-100">
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
    </section>

    <section aria-label="Layers">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-xs font-semibold">Layers</h2>
        <button type="button" aria-label="Add layer" class="rounded px-2 hover:bg-zinc-700" @click="store.addLayer()">+</button>
      </div>
      <ul class="space-y-1">
        <li
          v-for="(layer, index) in store.layers"
          :key="layer.id"
          class="flex items-center gap-1 rounded"
          :class="store.activeLayerIndex === index ? 'bg-sky-500/20' : 'bg-zinc-800'"
        >
          <button
            type="button"
            :aria-label="`Toggle visibility of ${layer.name}`"
            :aria-pressed="layer.visible"
            class="p-1.5"
            @click="layer.visible = !layer.visible"
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
        </li>
      </ul>
    </section>

    <section aria-label="Color palette">
      <h2 class="mb-2 text-xs font-semibold">Colors</h2>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="color in palette"
          :key="color"
          type="button"
          :aria-label="`Select color ${color}`"
          :aria-pressed="store.activeColor === color"
          :title="color"
          class="h-6 w-6 rounded-sm border-2"
          :class="store.activeColor === color ? 'border-sky-400' : 'border-zinc-600'"
          :style="{ backgroundColor: color }"
          @click="store.activeColor = color"
        />
      </div>
      <label class="mt-3 flex items-center justify-between gap-1 text-xs">
        Custom color
        <input v-model="store.activeColor" type="color" class="h-7 w-10 cursor-pointer bg-transparent" />
      </label>
    </section>
  </div>
</template>