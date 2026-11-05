<script setup lang="ts">
import { ref } from "vue";
import { usePackStore } from "../../stores/packState";
import { CANVAS_ANCHORS, type CanvasAnchor } from "../../logic/canvasResize";
import ModalDialog from "./ModalDialog.vue";

const emit = defineEmits<{ close: []; resized: [] }>();
const store = usePackStore();
const width = ref(store.frameWidth);
const height = ref(store.frameHeight);
const locked = ref(true);
let aspectRatio = store.frameWidth / store.frameHeight;
const anchor = ref<CanvasAnchor>("center");
const resizeContent = ref(false);
const error = ref("");

function toggleLock() {
  locked.value = !locked.value;
  if (locked.value && width.value > 0 && height.value > 0) {
    aspectRatio = width.value / height.value;
  }
}

function updateDimension(dimension: "width" | "height", event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  const value = event.target.valueAsNumber;
  if (dimension === "width") width.value = value;
  else height.value = value;
  if (!locked.value || !Number.isSafeInteger(value) || value <= 0) return;
  if (dimension === "width") height.value = Math.max(1, Math.round(value / aspectRatio));
  else width.value = Math.max(1, Math.round(value * aspectRatio));
}

function resize() {
  try {
    store.resizeCanvasAdvanced(width.value, height.value, anchor.value, resizeContent.value);
    emit("resized");
    emit("close");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}
</script>

<template>
  <ModalDialog title="Resize canvas" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="resize">
      <div class="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <label class="text-sm">
          Width
          <input :value="width" type="number" min="1" step="1" required autofocus class="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 p-2" @input="updateDimension('width', $event)" />
        </label>
        <button type="button" aria-label="Lock proportions" :aria-pressed="locked" class="rounded border border-zinc-600 px-2 py-2 text-sm hover:bg-zinc-700" @click="toggleLock">
          {{ locked ? 'Locked' : 'Unlocked' }}
        </button>
        <label class="text-sm">
          Height
          <input :value="height" type="number" min="1" step="1" required class="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 p-2" @input="updateDimension('height', $event)" />
        </label>
      </div>
      <p class="text-xs text-zinc-400">Use 16, 32, 64, or custom dimensions. Only the active texture is resized.</p>
      <p v-if="store.activeAnimation" class="text-xs text-zinc-400">These are frame dimensions. All frames are resized together, preserving their playback order and timing.</p>
      <fieldset :disabled="resizeContent">
        <legend class="mb-2 text-sm">Anchor point</legend>
        <div class="grid w-32 grid-cols-3 gap-1">
          <button
            v-for="(point, index) in CANVAS_ANCHORS" :key="point" type="button"
            :aria-label="`Anchor ${point}`" :aria-pressed="anchor === point" :title="point"
            class="h-10 rounded border disabled:opacity-40"
            :class="anchor === point ? 'border-sky-400 bg-sky-500/30' : 'border-zinc-500 bg-zinc-800 hover:bg-zinc-700'"
            @click="anchor = point"
          >
            <svg aria-hidden="true" viewBox="0 0 30 30" class="h-full w-full" fill="currentColor">
              <circle :cx="6 + (index % 3) * 9" :cy="6 + Math.floor(index / 3) * 9" r="3" />
            </svg>
          </button>
        </div>
      </fieldset>
      <label class="flex items-center gap-2 text-sm"><input v-model="resizeContent" type="checkbox" />Resize content</label>
      <p class="text-xs text-zinc-400">
        {{ resizeContent ? 'Scale all layers using nearest-neighbor pixels. The anchor is not used.' : 'Crop or pad all layers with transparency around the selected anchor.' }}
      </p>
      <p v-if="error" role="alert" class="text-sm text-red-400">{{ error }}</p>
      <footer class="flex justify-end gap-2">
        <button type="button" class="rounded px-3 py-2 hover:bg-zinc-700" @click="emit('close')">Cancel</button>
        <button type="submit" class="rounded bg-sky-700 px-3 py-2 hover:bg-sky-600">Resize</button>
      </footer>
    </form>
  </ModalDialog>
</template>
